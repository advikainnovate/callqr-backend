import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { logger } from '../utils';
import { callSessionService } from './callSession.service';
import { userService } from './user.service';
import { notificationService } from './notification.service';
import { socketEmitter } from './socketEmitter.service';
import {
  SocketRateLimiter,
  ConnectionRateLimiter,
  rateLimitProfiles,
} from '../middleware/socketRateLimit';
import { normalizeUserId, parseIdentity } from '../utils/identityUtils';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
}

interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-ended';
  callId: string;
  targetUserId: string;
  data: any;
}

interface ICEConfiguration {
  iceServers: RTCIceServer[];
}

interface SocketAuthPayload {
  token?: string;
  guestId?: string;
}

interface ResolvedSocketIdentity {
  userId: string;
  email: string;
}

// Singleton instance — set by server.ts after initialization
let _instance: WebRTCService | null = null;
export const getWebRTCService = (): WebRTCService | null => _instance;
export const setWebRTCService = (instance: WebRTCService) => {
  _instance = instance;
};

export class WebRTCService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId
  private iceConfig: ICEConfiguration;
  private rateLimiter: SocketRateLimiter;
  private connectionLimiter: ConnectionRateLimiter;
  private staleCallTimer: NodeJS.Timeout | null = null;
  private signalQueue: Map<
    string,
    { event: string; payload: any; timestamp: number }[]
  > = new Map();
  private pendingDeliveries: Map<string, NodeJS.Timeout> = new Map(); // messageId -> timeout
  private lastTypingEmitted: Map<string, number> = new Map(); // userId -> lastTimestamp

  constructor(server: HTTPServer) {
    // Initialize rate limiters
    this.rateLimiter = new SocketRateLimiter();
    this.connectionLimiter = new ConnectionRateLimiter(10, 60000); // 10 connections per minute per IP

    this.io = new SocketIOServer(server, {
      path: '/socket.io',
      perMessageDeflate: false, // Fix for Nginx RSV1 error
      cors: {
        origin: true, // Echoes back the request origin (perfect for credentials)
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket'], // Skip polling to avoid 'Worker Process' mismatch
    });

    // Initialize ICE configuration with STUN/TURN servers
    this.iceConfig = {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(process.env.TURN_SERVER
          ? [
              {
                urls: process.env.TURN_SERVER,
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_PASSWORD,
              },
            ]
          : []),
      ],
    };

    this.setupMiddleware();
    this.setupEventHandlers();
    socketEmitter.init(this.io);

    // Periodically timeout unanswered calls (every 30s, kills calls ringing > 60s)
    this.staleCallTimer = setInterval(async () => {
      try {
        const timedOut = await callSessionService.timeoutStaleCalls(60);
        for (const call of timedOut) {
          const callerId =
            call.callerId || (call.guestId ? `guest:${call.guestId}` : null);
          if (callerId) {
            socketEmitter.emitToUser(callerId, 'call-ended', {
              callId: call.id,
              endedBy: 'timeout',
            });
          }
          socketEmitter.emitToUser(call.receiverId, 'call-ended', {
            callId: call.id,
            endedBy: 'timeout',
          });
          socketEmitter.leaveCallRoom(call.id);
        }
      } catch (err) {
        logger.error('Error in stale call cleanup:', err);
      }
    }, 30000);
  }

  private setupMiddleware() {
    // Connection rate limiting (before authentication)
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      const ip = socket.handshake.address;
      const { allowed, retryAfter } =
        this.connectionLimiter.allowConnection(ip);

      if (!allowed) {
        logger.warn(`Connection rate limit exceeded for IP: ${ip}`);
        return next(
          new Error(`Too many connections. Retry after ${retryAfter} seconds.`)
        );
      }

      next();
    });

    // Authenticate socket connections
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const identity = await this.resolveSocketIdentity(
          socket.handshake.auth
        );
        socket.userId = identity.userId;
        socket.email = identity.email;
        return next();
      } catch (error) {
        logger.warn('Socket authentication failed:', error);
        next(
          error instanceof Error ? error : new Error('Authentication failed')
        );
      }
    });
  }

  private async resolveSocketIdentity(
    auth: SocketAuthPayload
  ): Promise<ResolvedSocketIdentity> {
    const { token, guestId } = auth;

    if (token) {
      const decoded = jwt.verify(token, appConfig.jwt.secret) as any;

      if (decoded.type === 'guest' && decoded.guestId) {
        return {
          userId: `guest:${decoded.guestId}`,
          email: 'Anonymous Caller',
        };
      }

      if (decoded.type === 'user' && decoded.userId) {
        const user = await userService.getUserById(decoded.userId);

        if (!user || user.status !== 'active') {
          throw new Error('Invalid user');
        }

        if (await userService.isGloballyBlocked(user.id)) {
          throw new Error('Account is globally blocked.');
        }

        return {
          userId: user.id,
          email: user.username,
        };
      }

      throw new Error('Invalid token payload');
    }

    if (guestId) {
      return {
        userId: `guest:${guestId}`,
        email: 'Anonymous Caller',
      };
    }

    throw new Error('Authentication token or guest ID required');
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;

      logger.info(`User connected to WebRTC: ${userId}`);

      // Store user connection
      this.connectedUsers.set(userId, socket.id);
      logger.info(
        `User connected: ${userId} (${socket.id}). Total online: ${this.connectedUsers.size}`
      );

      // Join user to their personal room
      socket.join(userId);

      /*
      // Handle WebRTC signaling with rate limiting
      socket.use((packet, next) => {
        const [eventName, data] = packet;
        // ... (rest of the rate limit logic)
      });
      */

      // Handle specific WebRTC events
      socket.on(
        'webrtc-offer',
        async (data: { callId: string; offer: any }) => {
          await this.handleWebRTCOffer(socket, data);
        }
      );

      socket.on(
        'webrtc-answer',
        async (data: { callId: string; answer: any }) => {
          await this.handleWebRTCAnswer(socket, data);
        }
      );

      socket.on(
        'webrtc-ice-candidate',
        async (data: { callId: string; candidate: any }) => {
          await this.handleWebRTCIceCandidate(socket, data);
        }
      );

      // Handle call initiation
      socket.on('initiate-call', async (data: { callId: string }) => {
        await this.handleCallInitiation(socket, data);
      });

      // Handle call acceptance
      socket.on('accept-call', async (data: { callId: string }) => {
        await this.handleCallAcceptance(socket, data);
      });

      // Handle call rejection
      socket.on('reject-call', async (data: { callId: string }) => {
        await this.handleCallRejection(socket, data);
      });

      // Handle call end
      socket.on('end-call', async (data: { callId: string }) => {
        await this.handleCallEnd(socket, data);
      });

      socket.on('call:end', async (data: { callId: string }) => {
        await this.handleCallEnd(socket, data);
      });

      // Chat event handlers
      socket.on('join-chat', async (data: { chatSessionId: string }) => {
        await this.handleJoinChat(socket, data);
      });

      socket.on('leave-chat', async (data: { chatSessionId: string }) => {
        await this.handleLeaveChat(socket, data);
      });

      socket.on('typing-start', async (data: { chatSessionId: string }) => {
        await this.handleTypingStart(socket, data);
      });

      socket.on('typing-stop', async (data: { chatSessionId: string }) => {
        await this.handleTypingStop(socket, data);
      });

      socket.on(
        'message-read',
        async (data: { chatSessionId: string; messageId: string }) => {
          await this.handleMessageRead(socket, data);
        }
      );

      socket.on(
        'message-delivered',
        async (data: { chatSessionId: string; messageId: string }) => {
          await this.handleMessageDelivered(socket, data);
        }
      ); // Handle disconnection with 5s grace period for network flickers
      socket.on('disconnect', async reason => {
        logger.info(
          `User socket disconnected from WebRTC: ${userId}. Reason: ${reason}`
        );

        // Wait 5 seconds before cleaning up sessions
        setTimeout(async () => {
          // Check if user has reconnected with a new socket in the meantime
          const sockets = await this.io.in(userId).fetchSockets();
          if (sockets.length > 0) {
            logger.info(
              `User ${userId} reconnected within grace period. Skipping call cleanup.`
            );
            return;
          }

          logger.info(
            `Cleaning up calls for user ${userId} after grace period.`
          );
          this.connectedUsers.delete(userId);
          this.lastTypingEmitted.delete(userId);

          try {
            const endedCalls = await callSessionService.endActiveCallsForUser(
              userId,
              'error'
            );
            for (const call of endedCalls) {
              const callerId = call.callerId || `guest:${call.guestId}`;
              const otherUserId =
                callerId === userId ? call.receiverId : callerId;

              // Emit to the other party's personal room (guaranteed delivery)
              socketEmitter.emitToUser(otherUserId, 'call-ended', {
                callId: call.id,
                endedBy: userId,
                reason: 'disconnect',
              });

              // Broadast to call room (if anyone still there)
              socketEmitter.emitCallStatus(call.id, 'ended', {
                endedBy: userId,
                reason: 'disconnect',
              });

              socketEmitter.leaveCallRoom(call.id);
            }
          } catch (err) {
            logger.error(
              `Error cleaning up calls on disconnect for user ${userId}:`,
              err
            );
          }
        }, 5000);
      });
    });
  }

  /**
   * Universal authorization check for call participants (Regular users & Guests).
   * returns the call object if authorized, otherwise null.
   */
  private async getAuthorizedCallSession(
    callId: string,
    socketUserId: string | undefined
  ): Promise<any | null> {
    if (!socketUserId) return null;

    try {
      return await callSessionService.getCallSessionForActor(
        callId,
        socketUserId
      );
    } catch (error) {
      logger.error(`Auth check failed for call ${callId}:`, error);
      return null;
    }
  }

  private async handleWebRTCOffer(
    socket: AuthenticatedSocket,
    data: { callId: string; offer: any }
  ) {
    try {
      const { callId, offer } = data;

      // Centralized authorization
      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call) {
        logger.warn(
          `Unauthorized offer attempt from ${socket.userId} for call ${callId}`
        );
        socket.emit('error', {
          message: 'Unauthorized to send offer for this call',
        });
        return;
      }

      const targetSocketId = this.resolveTargetIdentity(call, socket.userId!);

      const payload = {
        callId,
        fromUserId: socket.userId,
        offer,
      };

      logger.info(
        `[CALL_TIMING] offer received for ${callId} from ${socket.userId} to ${targetSocketId} at ${new Date().toISOString()}`
      );

      // Forward granular offer event
      this.forwardWebRTCSignal(
        callId,
        'webrtc-offer',
        payload,
        socket,
        targetSocketId
      );
    } catch (error) {
      logger.error('Error handling WebRTC offer:', error);
      socket.emit('error', { message: 'Failed to process offer' });
    }
  }

  private async handleWebRTCAnswer(
    socket: AuthenticatedSocket,
    data: { callId: string; answer: any }
  ) {
    try {
      const { callId, answer } = data;

      // Centralized authorization
      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call) {
        logger.warn(
          `Unauthorized answer attempt from ${socket.userId} for call ${callId}`
        );
        socket.emit('error', {
          message: 'Unauthorized to send answer for this call',
        });
        return;
      }

      const targetSocketId = this.resolveTargetIdentity(call, socket.userId!);

      const payload = {
        callId,
        fromUserId: socket.userId,
        answer,
      };

      logger.info(
        `[CALL_TIMING] answer received for ${callId} from ${socket.userId} to ${targetSocketId} at ${new Date().toISOString()}`
      );

      // Forward granular answer event
      this.forwardWebRTCSignal(
        callId,
        'webrtc-answer',
        payload,
        socket,
        targetSocketId
      );
    } catch (error) {
      logger.error('Error handling WebRTC answer:', error);
      socket.emit('error', { message: 'Failed to process answer' });
    }
  }

  private async handleWebRTCIceCandidate(
    socket: AuthenticatedSocket,
    data: { callId: string; candidate: any }
  ) {
    try {
      const { callId, candidate } = data;

      // Centralized authorization
      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call) {
        logger.warn(
          `Unauthorized ICE candidate from ${socket.userId} for call ${callId}`
        );
        socket.emit('error', {
          message: 'Unauthorized to send ICE candidate for this call',
        });
        return;
      }

      const targetSocketId = this.resolveTargetIdentity(call, socket.userId!);

      const payload = {
        callId,
        fromUserId: socket.userId,
        candidate,
      };

      logger.info(
        `[CALL_TIMING] ice candidate received for ${callId} from ${socket.userId} to ${targetSocketId} at ${new Date().toISOString()}`
      );

      // Forward granular ICE event
      this.forwardWebRTCSignal(
        callId,
        'webrtc-ice-candidate',
        payload,
        socket,
        targetSocketId
      );
    } catch (error) {
      logger.error('Error handling WebRTC ICE candidate:', error);
      socket.emit('error', { message: 'Failed to process ICE candidate' });
    }
  }

  /**
   * Resolves the socket room name of the other participant in a call.
   */
  private resolveTargetIdentity(call: any, socketUserId: string): string {
    const current = normalizeUserId(socketUserId);
    if (!current) return '';

    if (current.type === 'guest') {
      // Guest is always the caller, so target is receiver
      return call.receiverId;
    } else {
      // Registered user
      if (call.callerId === current.id) {
        // Current user is caller, target is receiver
        return call.receiverId;
      } else {
        // Current user is receiver, target is whoever initiated the call
        return call.callerId || (call.guestId ? `guest:${call.guestId}` : '');
      }
    }
  }

  /**
   * Forwards a WebRTC signal using the optimal delivery strategy:
   * 1. Primary: Broadcast to the call room (excluding sender).
   * 2. Fallback: Direct emission to user room if room size is incomplete.
   */
  private forwardWebRTCSignal(
    callId: string,
    event: string,
    payload: any,
    socket: AuthenticatedSocket,
    targetSocketId: string
  ) {
    const roomName = `call:${callId}`;
    const roomSize = this.io.sockets.adapter.rooms.get(roomName)?.size || 0;

    // 1. If both peers present → send normally
    if (roomSize >= 2) {
      logger.info(
        `[CALL_TIMING] forwarding ${event} for ${callId} immediately (roomSize=${roomSize}) at ${new Date().toISOString()}`
      );
      socket.to(roomName).emit(event, payload);
      return;
    }

    // 2. Otherwise → queue the signal for replay
    if (!this.signalQueue.has(callId)) {
      this.signalQueue.set(callId, []);
    }

    this.signalQueue.get(callId)!.push({
      event,
      payload,
      timestamp: Date.now(),
    });

    logger.warn(
      `[QUEUE] Signal ${event} queued for call ${callId} (roomSize=${roomSize}) at ${new Date().toISOString()}`
    );
  }

  private async handleCallInitiation(
    socket: AuthenticatedSocket,
    data: { callId: string }
  ) {
    try {
      const { callId } = data;
      const initiationStartedAt = Date.now();

      // Centralized authorization
      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call) {
        logger.warn(
          `Unauthorized attempt to initiate call ${callId} from ${socket.userId}`
        );
        socket.emit('error', { message: 'Unauthorized to initiate this call' });
        return;
      }

      // Join the call room immediately (Crucial for signaling reliability)
      socket.join(`call:${callId}`);
      logger.info(`[Room] ${socket.userId} joined call:${callId} (Initiator)`);
      logger.info(
        `[CALL_TIMING] initiator ${socket.userId} joined room for ${callId} in ${Date.now() - initiationStartedAt}ms`
      );

      // Flush any queued signals for this call immediately (Handles Reconnection)
      this.flushSignalQueue(callId);

      // Get caller's username
      let callerUsername = 'Anonymous Caller';
      if (call.callerId) {
        try {
          const caller = await userService.getUserById(call.callerId);
          callerUsername = caller.username;
        } catch (err) {
          logger.warn(`Failed to fetch caller ${call.callerId}:`, err);
        }
      }

      // Notify receiver
      const isReceiverOnline = this.isUserOnline(call.receiverId);
      console.log(
        `[DEBUG] WebRTC: Notifying receiver ${call.receiverId}. Online status: ${isReceiverOnline}`
      );

      if (isReceiverOnline) {
        // Receiver is online — deliver via their personal room
        console.log(
          `[DEBUG] WebRTC: Emitting incoming-call to user room ${call.receiverId}`
        );
        socketEmitter.emitToUser(call.receiverId, 'incoming-call', {
          callId: call.id,
          callerId: call.callerId || `guest:${call.guestId}`,
          callerUsername: callerUsername,
          iceServers: this.iceConfig.iceServers,
        });
        logger.info(
          `[CALL_TIMING] incoming-call emitted for ${callId} to receiver ${call.receiverId} after ${Date.now() - initiationStartedAt}ms`
        );
      } else {
        // Receiver is offline — wake them via push notification
        logger.info(
          `Receiver ${call.receiverId} is offline, sending push notification for call ${callId}`
        );
        const deviceTokens = await userService.getUserDeviceTokens(
          call.receiverId
        );
        await notificationService.sendCallNotification(deviceTokens, {
          callId: call.id,
          callerId: call.callerId || `guest:${call.guestId}`,
          callerUsername: callerUsername,
          iceServers: JSON.stringify(this.iceConfig.iceServers),
        });
      }

      // Always update status to ringing so the call is trackable
      await callSessionService.updateCallStatus(
        callId,
        socket.userId!,
        'ringing'
      );
      logger.info(
        `[CALL_TIMING] call ${callId} marked ringing after ${Date.now() - initiationStartedAt}ms`
      );

      // 🔴 IMPORTANT: Notify the caller that signaling can now start
      socket.emit('call-initiated', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });
      logger.info(
        `[CALL_TIMING] call-initiated emitted to ${socket.userId} for ${callId} after ${Date.now() - initiationStartedAt}ms`
      );

      // Broadcast status update for UI sync
      socketEmitter.emitCallStatus(callId, 'ringing', {
        callerId: call.callerId || `guest:${call.guestId}`,
        receiverId: call.receiverId,
      });

      // Implement a 30s connection timeout
      // If the call doesn't reach 'connected' state within 30s, end it automatically.
      setTimeout(async () => {
        try {
          const currentCall =
            await callSessionService.getCallSessionById(callId);
          if (
            currentCall.status === 'initiated' ||
            currentCall.status === 'ringing'
          ) {
            logger.info(`Call ${callId} timed out before connection.`);
            await callSessionService.endCall(callId, 'system', 'timeout');
            socketEmitter.emitCallStatus(callId, 'ended', {
              reason: 'timeout',
            });
            socketEmitter.emitToUser(call.receiverId, 'call-ended', {
              callId,
              reason: 'timeout',
            });
            const initiatorId = call.callerId || `guest:${call.guestId}`;
            socketEmitter.emitToUser(initiatorId, 'call-ended', {
              callId,
              reason: 'timeout',
            });
          }
        } catch (err) {
          logger.error(`Error in call ${callId} connection timeout:`, err);
        }
      }, 30000);
    } catch (error) {
      logger.error('Error handling call initiation:', error);
      socket.emit('error', { message: 'Failed to initiate call' });
    }
  }

  private async handleCallAcceptance(
    socket: AuthenticatedSocket,
    data: { callId: string }
  ) {
    try {
      const { callId } = data;
      const acceptanceStartedAt = Date.now();
      logger.info(
        `[CALL_TIMING] accept-call received for ${callId} from ${socket.userId} at ${new Date().toISOString()}`
      );

      // Centralized authorization
      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call) {
        logger.warn(
          `Unauthorized attempt to accept call ${callId} from ${socket.userId}`
        );
        socket.emit('error', { message: 'Unauthorized to accept this call' });
        return;
      }

      // CRITICAL FIX: Join the call room BEFORE updating status
      socket.join(`call:${callId}`);
      logger.info(`[Room] ${socket.userId} joined call:${callId} (Receiver)`);
      logger.info(
        `[CALL_TIMING] receiver ${socket.userId} joined room for ${callId} after ${Date.now() - acceptanceStartedAt}ms`
      );

      // Flush any queued signals for this call immediately after joining
      this.flushSignalQueue(callId);
      logger.info(
        `[CALL_TIMING] queue flush completed for ${callId} after ${Date.now() - acceptanceStartedAt}ms`
      );

      // Update call status
      await callSessionService.acceptCall(callId, socket.userId!);
      logger.info(
        `[CALL_TIMING] call ${callId} accepted in DB after ${Date.now() - acceptanceStartedAt}ms`
      );

      // Notify caller via call room AND personal room (double delivery)
      socketEmitter.emitToCallRoom(callId, 'call-accepted', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });
      const callerId = call.callerId || `guest:${call.guestId}`;
      socketEmitter.emitToUser(callerId, 'call-accepted', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });
      logger.info(
        `[CALL_TIMING] call-accepted emitted for ${callId} after ${Date.now() - acceptanceStartedAt}ms`
      );

      // Notify receiver that call is connected
      socket.emit('call-connected', {
        callId: call.id,
        iceServers: this.iceConfig.iceServers,
      });
      logger.info(
        `[CALL_TIMING] call-connected emitted to ${socket.userId} for ${callId} after ${Date.now() - acceptanceStartedAt}ms`
      );

      // Broadcast status update for UI sync
      socketEmitter.emitCallStatus(callId, 'connected');
      logger.info(
        `[CALL_TIMING] connected status broadcast for ${callId} after ${Date.now() - acceptanceStartedAt}ms`
      );
    } catch (error) {
      logger.error('Error handling call acceptance:', error);
      socket.emit('error', { message: 'Failed to accept call' });
    }
  }

  private async handleCallRejection(
    socket: AuthenticatedSocket,
    data: { callId: string }
  ) {
    try {
      const { callId } = data;

      const call = await this.getAuthorizedCallSession(callId, socket.userId);
      if (!call || call.receiverId !== normalizeUserId(socket.userId!)?.id) {
        socket.emit('error', { message: 'Unauthorized to reject this call' });
        return;
      }

      // Update call status
      await callSessionService.rejectCall(callId, socket.userId!);

      // Notify caller via their personal room
      const callerId = call.callerId || `guest:${call.guestId}`;
      socketEmitter.emitToUser(callerId!, 'call-rejected', {
        callId: call.id,
        receiverId: call.receiverId,
      });

      // Cleanup signal queue immediately on rejection
      this.signalQueue.delete(callId);

      // Ensure they leave the room (if they ever joined)
      socket.leave(`call:${callId}`);
    } catch (error) {
      logger.error('Error handling call rejection:', error);
      socket.emit('error', { message: 'Failed to reject call' });
    }
  }

  private async handleCallEnd(
    socket: AuthenticatedSocket,
    data: { callId: string }
  ) {
    try {
      const { callId } = data;

      // End the call in DB
      const updatedCall = await callSessionService.endCall(
        callId,
        socket.userId!,
        undefined
      );
      if (!updatedCall) {
        socket.emit('error', { message: 'Failed to end call' });
        return;
      }

      // Get call details to notify other participant
      const call = await callSessionService.getCallSessionById(callId);
      if (call) {
        const targetSocketId = this.resolveTargetIdentity(call, socket.userId!);

        // Notify the room so the other party gets the message
        socketEmitter.emitToCallRoom(callId, 'call-ended', {
          callId: call.id,
          endedBy: socket.userId,
        });

        // Fallback: Notify via personal room as well
        if (targetSocketId) {
          socketEmitter.emitToUser(targetSocketId, 'call-ended', {
            callId: call.id,
            endedBy: socket.userId,
          });
        }
      }

      // Clean up signaling queue for this call
      this.signalQueue.delete(callId);

      // Cleanup room membership
      socket.leave(`call:${callId}`);

      // Broadcast status update for UI sync
      socketEmitter.emitCallStatus(callId, 'ended', {
        endedBy: socket.userId,
      });

      // Confirm to sender
      socket.emit('call-ended', { callId });
    } catch (error) {
      logger.error('Error handling call end:', error);
      socket.emit('error', { message: 'Failed to end call' });
    }
  }

  // Chat event handlers
  private async handleJoinChat(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string }
  ) {
    try {
      const { chatSessionId } = data;

      // Safety check — only participants can join the room
      const { chatSessionService } = await import('./chatSession.service');
      const isParticipant = await chatSessionService.verifyParticipant(
        chatSessionId,
        socket.userId!
      );
      if (!isParticipant) {
        socket.emit('error', { message: 'Not a participant in this chat' });
        return;
      }

      socket.join(`chat:${chatSessionId}`);
      logger.info(`User ${socket.userId} joined chat room: ${chatSessionId}`);

      socket.emit('chat-joined', { chatSessionId });
    } catch (error) {
      logger.error('Error joining chat:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  }

  private async handleLeaveChat(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string }
  ) {
    try {
      const { chatSessionId } = data;

      // Leave the chat room
      socket.leave(`chat:${chatSessionId}`);
      logger.info(`User ${socket.userId} left chat room: ${chatSessionId}`);

      socket.emit('chat-left', { chatSessionId });
    } catch (error) {
      logger.error('Error leaving chat:', error);
      socket.emit('error', { message: 'Failed to leave chat' });
    }
  }

  private async handleMessageDelivered(
    socket: AuthenticatedSocket,
    data: { messageId: string; chatSessionId: string }
  ) {
    try {
      const { messageId, chatSessionId } = data;

      // Mark message as delivered in database (Idempotent)
      const { messageService } = await import('./message.service');
      await messageService.markAsDelivered(messageId, socket.userId!);

      // Cancel server-side fallback timeout
      this.cancelDeliveryTimeout(messageId);

      // Notify sender about delivery (now via room for multi-device sync)
      socketEmitter.emitMessageDelivered(chatSessionId, {
        messageId,
        chatSessionId,
        deliveredBy: socket.userId!,
        deliveredAt: new Date().toISOString(),
      });

      logger.info(`Message ${messageId} delivered to user ${socket.userId}`);
    } catch (error) {
      logger.error('Error handling message delivery:', error);
    }
  }

  private async handleTypingStart(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string }
  ) {
    try {
      const { chatSessionId } = data;
      const { chatSessionService } = await import('./chatSession.service');
      const isParticipant = await chatSessionService.verifyParticipant(
        chatSessionId,
        socket.userId!
      );

      if (!isParticipant) {
        socket.emit('error', { message: 'Not a participant in this chat' });
        return;
      }

      // Throttle typing indicators (500ms per user)
      const now = Date.now();
      const lastEmitted = this.lastTypingEmitted.get(socket.userId!) || 0;
      if (now - lastEmitted < 500) return;

      this.lastTypingEmitted.set(socket.userId!, now);

      // Broadcast typing indicator to chat room (via io.to)
      socketEmitter.emitUserTyping(chatSessionId, socket.userId!);
    } catch (error) {
      logger.error('Error handling typing start:', error);
    }
  }

  private async handleTypingStop(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string }
  ) {
    try {
      const { chatSessionId } = data;
      const { chatSessionService } = await import('./chatSession.service');
      const isParticipant = await chatSessionService.verifyParticipant(
        chatSessionId,
        socket.userId!
      );

      if (!isParticipant) {
        socket.emit('error', { message: 'Not a participant in this chat' });
        return;
      }

      // Broadcast typing stop to chat room (except sender)
      socketEmitter.emitUserStoppedTyping(chatSessionId, socket.userId!);
    } catch (error) {
      logger.error('Error handling typing stop:', error);
    }
  }

  private async handleMessageRead(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string; messageId: string }
  ) {
    try {
      const { messageId } = data;
      const { messageService } = await import('./message.service');
      const message = await messageService.markAsRead(
        messageId,
        socket.userId!
      );

      // Persist read state first, then broadcast read receipt.
      socketEmitter.emitMessageRead(message.chatSessionId, {
        messageId,
        chatSessionId: message.chatSessionId,
        readBy: socket.userId!,
        readAt: message.readAt?.toISOString(),
      });

      logger.info(`Message ${messageId} read by ${socket.userId}`);
    } catch (error) {
      logger.error('Error handling message read:', error);
    }
  }

  // Public methods for external use — prefer socketEmitter for new code
  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public getICEConfiguration(): ICEConfiguration {
    return this.iceConfig;
  }

  /**
   * Gracefully shutdown the WebRTC service
   * Notifies all connected clients and closes connections
   */
  public async shutdown(reason: string = 'Server maintenance'): Promise<void> {
    logger.info('🔌 Initiating WebRTC service shutdown...');

    // Stop stale call cleanup timer
    if (this.staleCallTimer) {
      clearInterval(this.staleCallTimer);
      this.staleCallTimer = null;
    }

    const connectedCount = this.connectedUsers.size;
    logger.info(`📊 Notifying ${connectedCount} connected clients...`);

    // Notify all connected clients about shutdown
    socketEmitter.broadcast('server-shutdown', {
      reason,
      message: 'Server is shutting down. Please reconnect in a few moments.',
      timestamp: new Date().toISOString(),
    });

    // Give clients time to receive the notification (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Disconnect all clients gracefully
    const sockets = await this.io.fetchSockets();
    logger.info(`🔌 Disconnecting ${sockets.length} socket connections...`);

    for (const socket of sockets) {
      socket.disconnect(true);
    }

    // Close the Socket.IO server
    await new Promise<void>((resolve, reject) => {
      this.io.close(err => {
        if (err) {
          logger.error('Error closing Socket.IO server:', err);
          reject(err);
        } else {
          logger.info('✅ Socket.IO server closed');
          resolve();
        }
      });
    });

    // Cleanup rate limiters
    this.rateLimiter.destroy();
    this.connectionLimiter.destroy();
    logger.info('✅ Rate limiters cleaned up');

    // Clear internal state
    this.connectedUsers.clear();
    logger.info('✅ Internal state cleared');

    logger.info('✅ WebRTC service shutdown complete');
  }

  /**
   * Replays all queued signals in chronological order to the entire call room.
   * Both receiver and caller receive the signals (frontend fromUserId check handles filtering).
   */
  private flushSignalQueue(callId: string) {
    const queuedSignals = this.signalQueue.get(callId);

    if (queuedSignals && queuedSignals.length > 0) {
      // 1. Sort by timestamp to ensure correct WebRTC state transitions
      queuedSignals.sort((a, b) => a.timestamp - b.timestamp);

      logger.info(
        `[FLUSH] Replaying ${queuedSignals.length} signals for call ${callId} at ${new Date().toISOString()}`
      );

      // 2. Broadcast to the entire room (io.to includes sender)
      // This ensures both peers see all missing context
      const roomName = `call:${callId}`;
      for (const signal of queuedSignals) {
        logger.info(
          `[CALL_TIMING] replaying queued ${signal.event} for ${callId}; queuedFor=${Date.now() - signal.timestamp}ms`
        );
        this.io.to(roomName).emit(signal.event, signal.payload);
      }

      // 3. IMPORTANT: Clear the queue once delivered
      this.signalQueue.delete(callId);
    }
  }

  /**
   * Tracks a message delivery and provides a 5s fallback if no client ACK is received.
   * Only triggers if the receiver is currently online.
   */
  public trackMessageDelivery(
    messageId: string,
    chatSessionId: string,
    receiverId: string
  ) {
    // Correct logic: Only fallback-deliver if user is ONLINE
    if (!this.isUserOnline(receiverId)) return;

    // Safety: Clear existing timer if any (though message IDs should be unique)
    this.cancelDeliveryTimeout(messageId);

    const timeout = setTimeout(async () => {
      try {
        // RE-VERIFY: Only mark if STILL online (prevents false delivery on disconnect)
        if (!this.isUserOnline(receiverId)) {
          this.pendingDeliveries.delete(messageId);
          return;
        }

        const { messageService } = await import('./message.service');

        // Idempotent DB update (returns null if already delivered)
        const updatedMessage = await messageService.markAsDelivered(
          messageId,
          receiverId
        );

        if (updatedMessage) {
          logger.info(
            `[Reliability] Fallback delivered message ${messageId} after timeout (Receiver online)`
          );

          // Notify sender (status update)
          socketEmitter.emitMessageDelivered(chatSessionId, {
            messageId,
            chatSessionId,
            deliveredBy: receiverId,
            deliveredAt: new Date().toISOString(),
          });
        }

        this.pendingDeliveries.delete(messageId);
      } catch (error) {
        logger.error(`Error in delivery fallback for ${messageId}:`, error);
      }
    }, 5000);

    this.pendingDeliveries.set(messageId, timeout);
  }

  private cancelDeliveryTimeout(messageId: string) {
    const timer = this.pendingDeliveries.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.pendingDeliveries.delete(messageId);
    }
  }

  /**
   * Get server statistics
   */
  public getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      users: Array.from(this.connectedUsers.keys()),
    };
  }
}
