import { createServer } from 'http';
import { WebRTCService } from '../webrtc.service';
import { generateAccessToken, generateGuestToken } from '../../utils/jwt';

jest.mock('../socketEmitter.service', () => ({
  socketEmitter: {
    init: jest.fn(),
    emitMessageRead: jest.fn(),
    emitUserTyping: jest.fn(),
    emitUserStoppedTyping: jest.fn(),
    emitToUser: jest.fn(),
    emitToCallRoom: jest.fn(),
    emitCallStatus: jest.fn(),
    leaveCallRoom: jest.fn(),
    broadcast: jest.fn(),
  },
}));

jest.mock('../chatSession.service', () => ({
  chatSessionService: {
    verifyParticipant: jest.fn(),
  },
}));

jest.mock('../message.service', () => ({
  messageService: {
    markAsRead: jest.fn(),
  },
}));

jest.mock('../user.service', () => ({
  userService: {
    getUserById: jest.fn(),
    isGloballyBlocked: jest.fn(),
  },
}));

describe('WebRTCService realtime guards', () => {
  let httpServer: any;
  let webrtcService: WebRTCService;

  beforeEach(done => {
    jest.clearAllMocks();
    httpServer = createServer();
    webrtcService = new WebRTCService(httpServer);
    httpServer.listen(0, () => done());
  });

  afterEach(async () => {
    await webrtcService.shutdown('test shutdown');
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  it('persists read state before emitting read receipts', async () => {
    const { messageService } = await import('../message.service');
    const { socketEmitter } = await import('../socketEmitter.service');

    (messageService.markAsRead as jest.Mock).mockResolvedValue({
      id: 'message-1',
      chatSessionId: 'chat-real',
      readAt: new Date('2026-04-08T12:00:00.000Z'),
    });

    const socket = {
      userId: 'user-1',
      emit: jest.fn(),
    } as any;

    await (webrtcService as any).handleMessageRead(socket, {
      chatSessionId: 'chat-client-sent',
      messageId: 'message-1',
    });

    expect(messageService.markAsRead).toHaveBeenCalledWith(
      'message-1',
      'user-1'
    );
    expect(socketEmitter.emitMessageRead).toHaveBeenCalledWith('chat-real', {
      messageId: 'message-1',
      chatSessionId: 'chat-real',
      readBy: 'user-1',
      readAt: '2026-04-08T12:00:00.000Z',
    });
  });

  it('blocks typing events for non-participants', async () => {
    const { chatSessionService } = await import('../chatSession.service');
    const { socketEmitter } = await import('../socketEmitter.service');

    (chatSessionService.verifyParticipant as jest.Mock).mockResolvedValue(
      false
    );

    const socket = {
      userId: 'user-1',
      emit: jest.fn(),
    } as any;

    await (webrtcService as any).handleTypingStart(socket, {
      chatSessionId: 'chat-1',
    });

    expect(chatSessionService.verifyParticipant).toHaveBeenCalledWith(
      'chat-1',
      'user-1'
    );
    expect(socketEmitter.emitUserTyping).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'Not a participant in this chat',
    });
  });

  it('accepts guest JWTs for socket authentication', async () => {
    const identity = await (webrtcService as any).resolveSocketIdentity({
      token: generateGuestToken('guest-123'),
    });

    expect(identity).toEqual({
      userId: 'guest:guest-123',
      email: 'Anonymous Caller',
    });
  });

  it('rejects globally blocked users during socket authentication', async () => {
    const { userService } = await import('../user.service');

    (userService.getUserById as jest.Mock).mockResolvedValue({
      id: 'user-1',
      username: 'blocked-user',
      status: 'active',
    });
    (userService.isGloballyBlocked as jest.Mock).mockResolvedValue(true);

    await expect(
      (webrtcService as any).resolveSocketIdentity({
        token: generateAccessToken({
          type: 'user',
          userId: 'user-1',
          username: 'blocked-user',
        }),
      })
    ).rejects.toThrow('Account is globally blocked.');
  });
});
