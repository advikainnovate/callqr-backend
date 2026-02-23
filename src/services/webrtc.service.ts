import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { logger } from '../utils';
import { callSessionService } from './callSession.service';
import { userService } from './user.service';
import { 
  SocketRateLimiter, 
  ConnectionRateLimiter, 
  rateLimitProfiles 
} from '../middleware/socketRateLimit';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
}

interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  callId: string;
  targetUserId: string;
  data: any;
}

interface ICEConfiguration {
  iceServers: RTCIceServer[];
}

export class WebRTCService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId
  private iceConfig: ICEConfiguration;
  private rateLimiter: SocketRateLimiter;
  private connectionLimiter: ConnectionRateLimiter;

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
  }

  private setupMiddleware() {
    // Connection rate limiting (before authentication)
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      const ip = socket.handshake.address;
      const { allowed, retryAfter } = this.connectionLimiter.allowConnection(ip);

      if (!allowed) {
        logger.warn(`Connection rate limit exceeded for IP: ${ip}`);
        return next(new Error(`Too many connections. Retry after ${retryAfter} seconds.`));
      }

      next();
    });

    // Authenticate socket connections
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, appConfig.jwt.secret) as any;
        const user = await userService.getUserById(decoded.userId);

        if (!user || user.status !== 'active') {
          return next(new Error('Invalid user'));
        }

        socket.userId = user.id;
        socket.email = user.username; // Using username instead of email
        next();
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

      // Handle WebRTC signaling with rate limiting
      socket.use((packet, next) => {
        const [eventName, data] = packet;
        
        // Apply rate limiting based on event type
        switch (eventName) {
          case 'webrtc-signal':
            return this.rateLimiter.createLimiter('webrtc-signal', rateLimitProfiles.signaling)(socket, data, next);
          
          case 'initiate-call':
          case 'accept-call':
          case 'reject-call':
          case 'end-call':
            return this.rateLimiter.createLimiter(eventName, rateLimitProfiles.callAction)(socket, data, next);
          
          case 'chat-message':
            return this.rateLimiter.createLimiter('chat-message', rateLimitProfiles.chatMessage)(socket, data, next);
          
          case 'typing-start':
          case 'typing-stop':
            return this.rateLimiter.createLimiter(eventName, rateLimitProfiles.typing)(socket, data, next);
          
          case 'join-chat':
          case 'leave-chat':
            return this.rateLimiter.createLimiter(eventName, rateLimitProfiles.chatRoom)(socket, data, next);
          
          case 'message-read':
            return this.rateLimiter.createLimiter('message-read', rateLimitProfiles.readReceipt)(socket, data, next);
          
          default:
            return next();
        }
      });

      // Handle WebRTC signaling
      socket.on('webrtc-signal', async (data: WebRTCSignal) => {
        await this.handleWebRTCSignal(socket, data);
      });

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

      socket.on('chat-message', async (data: { chatSessionId: string; messageId: string }) => {
        await this.handleChatMessage(socket, data);
      });

      socket.on('typing-start', async (data: { chatSessionId: string }) => {
        await this.handleTypingStart(socket, data);
      });

      socket.on('typing-stop', async (data: { chatSessionId: string }) => {
        await this.handleTypingStop(socket, data);
      });

      socket.on('message-read', async (data: { chatSessionId: string; messageId: string }) => {
        await this.handleMessageRead(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`User disconnected from WebRTC: ${userId}`);
        this.connectedUsers.delete(userId);
      });
    });
  }

  private async handleWebRTCSignal(
    socket: AuthenticatedSocket,
    data: WebRTCSignal
  ) {
    try {
      const { callId, targetUserId, data: signalData } = data;

      // Verify user is part of the call
      const call = await callSessionService.getCallSessionById(callId);
      if (
        !call ||
        (call.callerId !== socket.userId && call.receiverId !== socket.userId)
      ) {
        socket.emit('error', { message: 'Unauthorized to signal this call' });
        return;
      }

      // Forward signal to target user
      const targetSocketId = this.connectedUsers.get(targetUserId);
      if (targetSocketId) {
        logger.info(
          `[Signal] Forwarding ${data.type} from ${socket.userId} to ${targetUserId}`
        );
        this.io.to(targetSocketId).emit('webrtc-signal', {
          type: data.type,
          callId,
          fromUserId: socket.userId,
          data: data.data,
        });
      } else {
        logger.warn(
          `[Signal] Target user ${targetUserId} not found (Caller: ${socket.userId})`
        );
      }
    } catch (error) {
      logger.error('Error handling WebRTC signal:', error);
      socket.emit('error', { message: 'Failed to process signal' });
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
      if (!call || call.callerId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to initiate this call' });
        return;
      }

      // Get caller's username
      const caller = await userService.getUserById(call.callerId);

      // Notify receiver
      const receiverSocketId = this.connectedUsers.get(call.receiverId);
      if (receiverSocketId) {
        this.io.to(receiverSocketId).emit('incoming-call', {
          callId: call.id,
          callerId: call.callerId,
          callerUsername: caller.username,
        });

        // Update call status
        await callSessionService.updateCallStatus(callId, socket.userId!, 'ringing');
      } else {
        socket.emit('error', { message: 'Receiver is not online' });
      }
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

      // Update call status
      await callSessionService.updateCallStatus(callId, socket.userId!, 'connected');

      // Notify caller
      const callerSocketId = this.connectedUsers.get(call.callerId);
      if (callerSocketId) {
        this.io.to(callerSocketId).emit('call-accepted', {
          callId: call.id,
          receiverId: call.receiverId,
        });
      }

      // Notify receiver that call is connected
      socket.emit('call-connected', { callId: call.id });
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

      // Notify caller
      const callerSocketId = this.connectedUsers.get(call.callerId);
      if (callerSocketId) {
        this.io.to(callerSocketId).emit('call-rejected', {
          callId: call.id,
          receiverId: call.receiverId,
        });
      }
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

      // End the call
      const updatedCall = await callSessionService.endCall(callId, socket.userId!);
      if (!updatedCall) {
        socket.emit('error', { message: 'Failed to end call' });
        return;
      }

      // Get call details to notify other participant
      const call = await callSessionService.getCallSessionById(callId);
      if (call) {
        const otherUserId =
          call.callerId === socket.userId ? call.receiverId : call.callerId;
        const otherSocketId = this.connectedUsers.get(otherUserId);

        if (otherSocketId) {
          this.io.to(otherSocketId).emit('call-ended', {
            callId: call.id,
            endedBy: socket.userId,
          });
        }
      }

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
      
      // Join the chat room
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

  private async handleChatMessage(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string; messageId: string }
  ) {
    try {
      const { chatSessionId, messageId } = data;
      
      // Broadcast new message to chat room (except sender)
      socket.to(`chat:${chatSessionId}`).emit('new-message', {
        chatSessionId,
        messageId,
        senderId: socket.userId,
      });
      
      // Confirm delivery to sender
      socket.emit('message-delivered', {
        chatSessionId,
        messageId,
      });
      
      logger.info(`Message ${messageId} sent in chat ${chatSessionId}`);
    } catch (error) {
      logger.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private async handleTypingStart(
    socket: AuthenticatedSocket,
    data: { chatSessionId: string }
  ) {
    try {
      const { chatSessionId } = data;
      
      // Broadcast typing indicator to chat room (except sender)
      socket.to(`chat:${chatSessionId}`).emit('user-typing', {
        chatSessionId,
        userId: socket.userId,
      });
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
      socket.to(`chat:${chatSessionId}`).emit('user-stopped-typing', {
        chatSessionId,
        userId: socket.userId,
      });
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
      socket.to(`chat:${chatSessionId}`).emit('message-read', {
        chatSessionId,
        messageId,
        readBy: socket.userId,
      });
      
      logger.info(`Message ${messageId} read by ${socket.userId}`);
    } catch (error) {
      logger.error('Error handling message read:', error);
    }
  }

  // Public methods for external use
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
    
    const connectedCount = this.connectedUsers.size;
    logger.info(`📊 Notifying ${connectedCount} connected clients...`);

    // Notify all connected clients about shutdown
    this.io.emit('server-shutdown', {
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
      this.io.close((err) => {
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
