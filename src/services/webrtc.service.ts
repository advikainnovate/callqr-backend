import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { logger } from '../utils';
import { callService } from './call.service';
import { userService } from './user.service';

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

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: appConfig.cors.allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Initialize ICE configuration with STUN/TURN servers
    this.iceConfig = {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(process.env.TURN_SERVER ? [{
          urls: process.env.TURN_SERVER,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_PASSWORD
        }] : [])
      ]
    };

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authenticate socket connections
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, appConfig.jwt.secret) as any;
        const user = await userService.getUserById(decoded.userId);

        if (!user || !user.isActive) {
          return next(new Error('Invalid user'));
        }

        socket.userId = user.id;
        socket.email = user.email;
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

      // Join user to their personal room
      socket.join(userId);

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

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`User disconnected from WebRTC: ${userId}`);
        this.connectedUsers.delete(userId);
      });
    });
  }

  private async handleWebRTCSignal(socket: AuthenticatedSocket, data: WebRTCSignal) {
    try {
      const { callId, targetUserId, data: signalData } = data;

      // Verify user is part of the call
      const call = await callService.getCallById(callId);
      if (!call || (call.callerId !== socket.userId && call.receiverId !== socket.userId)) {
        socket.emit('error', { message: 'Unauthorized to signal this call' });
        return;
      }

      // Forward signal to target user
      const targetSocketId = this.connectedUsers.get(targetUserId);
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('webrtc-signal', {
          type: data.type,
          callId,
          fromUserId: socket.userId,
          data: data.data,
        });
      }
    } catch (error) {
      logger.error('Error handling WebRTC signal:', error);
      socket.emit('error', { message: 'Failed to process signal' });
    }
  }

  private async handleCallInitiation(socket: AuthenticatedSocket, data: { callId: string }) {
    try {
      const { callId } = data;

      // Verify call and get details
      const call = await callService.getCallById(callId);
      if (!call || call.callerId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to initiate this call' });
        return;
      }

      // Notify receiver
      const receiverSocketId = this.connectedUsers.get(call.receiverId);

      logger.info(`Initiating call ${callId} from ${socket.userId} to ${call.receiverId}`);
      logger.info(`Connected Users: ${JSON.stringify(Array.from(this.connectedUsers.keys()))}`);
      logger.info(`Receiver Socket ID found: ${receiverSocketId}`);

      if (receiverSocketId) {
        this.io.to(receiverSocketId).emit('incoming-call', {
          callId: call.id,
          callerId: call.callerId,
          callType: call.callType,
        });

        // Update call status
        await callService.updateCallStatus(callId, 'initiated');
      } else {
        logger.warn(`Receiver ${call.receiverId} is NOT online. Call failed.`);
        socket.emit('error', { message: 'Receiver is not online' });
      }
    } catch (error) {
      logger.error('Error handling call initiation:', error);
      socket.emit('error', { message: 'Failed to initiate call' });
    }
  }

  private async handleCallAcceptance(socket: AuthenticatedSocket, data: { callId: string }) {
    try {
      const { callId } = data;

      // Verify call and get details
      const call = await callService.getCallById(callId);
      if (!call || call.receiverId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to accept this call' });
        return;
      }

      // Update call status
      await callService.updateCallStatus(callId, 'connected');

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

  private async handleCallRejection(socket: AuthenticatedSocket, data: { callId: string }) {
    try {
      const { callId } = data;

      // Verify call and get details
      const call = await callService.getCallById(callId);
      if (!call || call.receiverId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to reject this call' });
        return;
      }

      // Update call status
      await callService.updateCallStatus(callId, 'failed');

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

  private async handleCallEnd(socket: AuthenticatedSocket, data: { callId: string }) {
    try {
      const { callId } = data;

      // End the call
      const success = await callService.endCall(callId, socket.userId!);
      if (!success) {
        socket.emit('error', { message: 'Failed to end call' });
        return;
      }

      // Get call details to notify other participant
      const call = await callService.getCallById(callId);
      if (call) {
        const otherUserId = call.callerId === socket.userId ? call.receiverId : call.callerId;
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
}
