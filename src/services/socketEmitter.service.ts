import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils';

/**
 * SocketEmitterService
 * Single place for all server-initiated socket emissions.
 * Controllers and services use this instead of touching io directly.
 */
class SocketEmitterService {
  private io: SocketIOServer | null = null;

  init(io: SocketIOServer) {
    this.io = io;
  }

  private get socket(): SocketIOServer {
    if (!this.io) throw new Error('SocketEmitterService not initialized');
    return this.io;
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  emitNewMessage(
    chatSessionId: string,
    payload: {
      id: string;
      chatSessionId: string;
      senderId: string;
      messageType: string;
      content: string;
      mediaAttachments: any;
      isDelivered: boolean | null;
      isRead: boolean | null;
      sentAt: Date | null;
    }
  ) {
    this.socket.to(`chat:${chatSessionId}`).emit('new-message', payload);
    logger.debug(`[Socket] new-message emitted to chat:${chatSessionId}`);
  }

  emitMessageDelivered(
    chatSessionId: string,
    payload: {
      messageId: string;
      chatSessionId: string;
      deliveredBy: string;
      deliveredAt: string;
    }
  ) {
    this.socket.to(`chat:${chatSessionId}`).emit('message-delivered', payload);
  }

  emitMessageRead(
    chatSessionId: string,
    payload: {
      messageId: string;
      chatSessionId: string;
      readBy: string;
      readAt?: string;
    }
  ) {
    this.socket.to(`chat:${chatSessionId}`).emit('message-read', payload);
  }

  emitUserTyping(chatSessionId: string, userId: string) {
    this.socket
      .to(`chat:${chatSessionId}`)
      .emit('user-typing', { chatSessionId, userId });
  }

  emitUserStoppedTyping(chatSessionId: string, userId: string) {
    this.socket
      .to(`chat:${chatSessionId}`)
      .emit('user-stopped-typing', { chatSessionId, userId });
  }

  // ─── Calls ────────────────────────────────────────────────────────────────

  emitToUser(userId: string, event: string, payload: any) {
    this.socket.to(userId).emit(event, payload);
    logger.debug(`[Socket] ${event} emitted to user:${userId}`);
  }

  emitToCallRoom(callId: string, event: string, payload: any) {
    this.socket.to(`call:${callId}`).emit(event, payload);
  }

  leaveCallRoom(callId: string) {
    this.socket.socketsLeave(`call:${callId}`);
  }

  // ─── Broadcast ────────────────────────────────────────────────────────────

  broadcast(event: string, payload: any) {
    this.socket.emit(event, payload);
  }
}

export const socketEmitter = new SocketEmitterService();
