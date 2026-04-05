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

  private get ioServer(): SocketIOServer {
    if (!this.io) throw new Error('SocketEmitterService not initialized');
    return this.io;
  }

  // ─── Room Checks ──────────────────────────────────────────────────────────

  /**
   * Checks if a user has any active socket connected and joined to a specific chat room.
   */
  isUserInChatRoom(userId: string, chatSessionId: string): boolean {
    if (!this.io) return false;
    const roomName = `chat:${chatSessionId}`;
    const sockets = this.io.sockets.adapter.rooms.get(roomName);

    if (!sockets) return false;

    // Check if any socket in the chat room belongs to the user
    // This is efficient because adapters handle room membership natively
    const userSockets = this.io.sockets.adapter.rooms.get(userId);
    if (!userSockets) return false;

    // Intersection check: Does the user have a socket that is also in the chat room?
    for (const socketId of userSockets) {
      if (sockets.has(socketId)) return true;
    }

    return false;
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
    this.ioServer.to(`chat:${chatSessionId}`).emit('new-message', payload);
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
    this.ioServer
      .to(`chat:${chatSessionId}`)
      .emit('message-delivered', payload);
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
    this.ioServer.to(`chat:${chatSessionId}`).emit('message-read', payload);
  }

  emitUserTyping(chatSessionId: string, userId: string) {
    this.ioServer
      .to(`chat:${chatSessionId}`)
      .emit('user-typing', { chatSessionId, userId });
  }

  emitUserStoppedTyping(chatSessionId: string, userId: string) {
    this.ioServer
      .to(`chat:${chatSessionId}`)
      .emit('user-stopped-typing', { chatSessionId, userId });
  }

  // ─── Calls ────────────────────────────────────────────────────────────────

  emitToUser(
    userId: string,
    event: string,
    payload: any,
    excludeSocketId?: string
  ) {
    const roomSize = this.io?.sockets.adapter.rooms.get(userId)?.size || 0;

    if (roomSize === 0) {
      logger.warn(
        `[Socket] No active sockets in room for user: ${userId}. Event ${event} may be lost.`
      );
    }

    let emitter = this.ioServer.to(userId);
    if (excludeSocketId) {
      emitter = emitter.except(excludeSocketId);
    }
    emitter.emit(event, payload);
    logger.debug(
      `[Socket] ${event} emitted to user room: ${userId} (Room size: ${roomSize}, Excluded: ${excludeSocketId || 'none'})`
    );
  }

  emitToCallRoom(
    callId: string,
    event: string,
    payload: any,
    excludeSocketId?: string
  ) {
    const roomName = `call:${callId}`;
    const roomSize = this.io?.sockets.adapter.rooms.get(roomName)?.size || 0;

    if (roomSize === 0) {
      logger.warn(
        `[Socket] No active sockets in call room: ${roomName}. Event ${event} may be lost.`
      );
    }

    let emitter = this.ioServer.to(roomName);
    if (excludeSocketId) {
      emitter = emitter.except(excludeSocketId);
    }
    emitter.emit(event, payload);
    logger.debug(
      `[Socket] ${event} emitted to ${roomName} (Room size: ${roomSize}, Excluded: ${excludeSocketId || 'none'})`
    );
  }

  emitCallStatus(callId: string, status: string, payload: any = {}) {
    this.emitToCallRoom(callId, 'call-status', {
      callId,
      status,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  leaveCallRoom(callId: string) {
    this.ioServer.socketsLeave(`call:${callId}`);
  }

  // ─── Broadcast ────────────────────────────────────────────────────────────

  broadcast(event: string, payload: any) {
    this.ioServer.emit(event, payload);
  }
}

export const socketEmitter = new SocketEmitterService();
