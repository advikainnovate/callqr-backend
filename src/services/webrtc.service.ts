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
        const { token, guestId } = socket.handshake.auth;

        if (token) {
          const decoded = jwt.verify(token, appConfig.jwt.secret) as any;
          const user = await userService.getUserById(decoded.userId);

          if (!user || user.status !== 'active') {
            return next(new Error('Invalid user'));
          }

          socket.userId = user.id;
          socket.email = user.username;
          return next();
        }

        if (guestId) {
          socket.userId = `guest:${guestId}`;
          socket.email = 'Anonymous Caller';
          return next();
        }

        return next(new Error('Authentication token or guest ID required'));
      } catch (error) {
        logger.warn('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
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

      // Handle WebRTC signaling
      socket.on('webrtc-signal', async (data: WebRTCSignal) => {
        await this.handleWebRTCSignal(socket, data);
      });

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
      );

      // Handle disconnection
      socket.on('disconnect', async reason => {
        logger.info(
          `User disconnected from WebRTC: ${userId}. Reason: ${reason}`
        );
        this.connectedUsers.delete(userId);

        // End any active calls this user was part of
        try {
          const endedCalls = await callSessionService.endActiveCallsForUser(
            userId,
            'error'
          );
          for (const call of endedCalls) {
            const callerId = call.callerId || `guest:${call.guestId}`;
            const otherUserId =
              callerId === userId ? call.receiverId : callerId;
            socketEmitter.emitToUser(otherUserId, 'call-ended', {
              callId: call.id,
              endedBy: 'disconnect',
            });
            socketEmitter.leaveCallRoom(call.id);
          }
        } catch (err) {
          logger.error(
            `Error cleaning up calls on disconnect for user ${userId}:`,
            err
          );
        }
      });
    });
  }

  private async handleWebRTCSignal(
    socket: AuthenticatedSocket,
    data: WebRTCSignal
  ) {
    try {
      const { callId, targetUserId, data: signalData } = data;

      // Verify user is part of the call in DB
      const call = await callSessionService.getCallSessionById(callId);
      if (
        !call ||
        (call.callerId !== socket.userId && call.receiverId !== socket.userId)
      ) {
        socket.emit('error', { message: 'Unauthorized to signal this call' });
        return;
      }

      // Forward signal to other participant via call room
      logger.info(
        `[Signal] Forwarding ${data.type} from ${socket.userId} in room call:${callId}`
      );
      socket.to(`call:${callId}`).emit('webrtc-signal', {
        type: data.type,
        callId,
        fromUserId: socket.userId,
        data: data.data,
      });
    } catch (error) {
      logger.error('Error handling WebRTC signal:', error);
      socket.emit('error', { message: 'Failed to process signal' });
    }
  }

  private async handleWebRTCOffer(
    socket: AuthenticatedSocket,
    data: { callId: string; offer: any }
  ) {
    try {
      const { callId, offer } = data;

      // Verify user is part of the call
      const call = await callSessionService.getCallSessionById(callId);
      if (
        !call ||
        (call.callerId !== socket.userId && call.receiverId !== socket.userId)
      ) {
        socket.emit('error', {
          message: 'Unauthorized to send offer for this call',
        });
        return;
      }

      // Forward offer to call room (other participant)
      socketEmitter.emitToCallRoom(callId, 'webrtc-offer', {
        callId,
        fromUserId: socket.userId,
        offer,
      });
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

      // Verify user is part of the call
      const call = await callSessionService.getCallSessionById(callId);
      if (
        !call ||
        (call.callerId !== socket.userId && call.receiverId !== socket.userId)
      ) {
        socket.emit('error', {
          message: 'Unauthorized to send answer for this call',
        });
        return;
      }

      // Forward answer to call room (other participant)
      socketEmitter.emitToCallRoom(callId, 'webrtc-answer', {
        callId,
        fromUserId: socket.userId,
        answer,
      });
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

      // Verify user is part of the call
      const call = await callSessionService.getCallSessionById(callId);
      if (
        !call ||
        (call.callerId !== socket.userId && call.receiverId !== socket.userId)
      ) {
        socket.emit('error', {
          message: 'Unauthorized to send ICE candidate for this call',
        });
        return;
      }

      // Forward ICE candidate to call room (other participant)
      socketEmitter.emitToCallRoom(callId, 'webrtc-ice-candidate', {
        callId,
        fromUserId: socket.userId,
        candidate,
      });
    } catch (error) {
      logger.error('Error handling WebRTC ICE candidate:', error);
      socket.emit('error', { message: 'Failed to process ICE candidate' });
    }
  }

  private async handleCallInitiation(
    socket: AuthenticatedSocket,
    data: { callId: string }
  ) {
    try {
      const { callId } = data;

      // Verify call and get details
      const call = await callSessionService.getCallSessionById(callId);
      let isAuthorized = false;
      if (socket.userId?.startsWith('guest:')) {
        const guestId = socket.userId.split(':')[1];
        isAuthorized = call && call.guestId === guestId;
      } else {
        isAuthorized = call && call.callerId === socket.userId;
      }

      if (!isAuthorized) {
        socket.emit('error', { message: 'Unauthorized to initiate this call' });
        return;
      }

      // Join the call room immediately
      socket.join(`call:${callId}`);
      logger.info(`User ${socket.userId} joined call room: ${callId}`);

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

      // 🔴 IMPORTANT: Notify the caller that signaling can now start
      // This sends them the ICE servers and confirms the call is ready for WebRTC negotiation
      socket.emit('call-initiated', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });
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

      // Verify call and get details
      const call = await callSessionService.getCallSessionById(callId);
      if (!call || call.receiverId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to accept this call' });
        return;
      }

      // CRITICAL FIX: Join the call room BEFORE updating status
      socket.join(`call:${callId}`);
      logger.info(`Receiver ${socket.userId} joined call room: ${callId}`);

      // Update call status
      await callSessionService.updateCallStatus(
        callId,
        socket.userId!,
        'connected'
      );

      // Notify caller via call room AND personal room (double delivery)
      socketEmitter.emitToCallRoom(callId, 'call-accepted', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });
      socketEmitter.emitToUser(call.callerId, 'call-accepted', {
        callId: call.id,
        receiverId: call.receiverId,
        iceServers: this.iceConfig.iceServers,
      });

      // Notify receiver that call is connected
      socket.emit('call-connected', {
        callId: call.id,
        iceServers: this.iceConfig.iceServers,
      });
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

      // Verify call and get details
      const call = await callSessionService.getCallSessionById(callId);
      if (!call || call.receiverId !== socket.userId) {
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
        socket.userId!
      );
      if (!updatedCall) {
        socket.emit('error', { message: 'Failed to end call' });
        return;
      }

      // Get call details to notify other participant
      const call = await callSessionService.getCallSessionById(callId);
      if (call) {
        const callerId = call.callerId || `guest:${call.guestId}`;
        const otherUserId =
          callerId === socket.userId ? call.receiverId : callerId;

        // Notify the room so the other party gets the message
        socketEmitter.emitToCallRoom(callId, 'call-ended', {
          callId: call.id,
          endedBy: socket.userId,
        });

        // Fallback: Notify via personal room as well
        socketEmitter.emitToUser(otherUserId!, 'call-ended', {
          callId: call.id,
          endedBy: socket.userId,
        });
      }

      // Cleanup room membership
      socket.leave(`call:${callId}`);

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

      // Mark message as delivered in database
      const { messageService } = await import('./message.service');
      await messageService.markAsDelivered(messageId, socket.userId!);

      // Notify sender about delivery
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

      // Broadcast typing indicator to chat room (except sender)
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
      const { chatSessionId, messageId } = data;

      // Broadcast read receipt to chat room (except sender)
      socketEmitter.emitMessageRead(chatSessionId, {
        messageId,
        chatSessionId,
        readBy: socket.userId!,
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
   * Get server statistics
   */
  public getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      users: Array.from(this.connectedUsers.keys()),
    };
  }
}
