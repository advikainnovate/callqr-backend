jest.mock('../../db', () => ({
  db: {
    update: jest.fn(),
  },
}));

const scheduleMock = jest.fn().mockReturnValue({ stop: jest.fn() });

jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: scheduleMock },
}));

describe('ChatSessionService', () => {
  let db: any;
  let mockUpdate: jest.Mock;
  let mockUpdateSet: jest.Mock;
  let mockUpdateWhere: jest.Mock;
  let mockUpdateReturning: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    const dbModule = await import('../../db');
    db = dbModule.db;
    mockUpdateReturning = jest
      .fn()
      .mockResolvedValue([{ id: 'chat-1' }, { id: 'chat-2' }]);
    mockUpdateWhere = jest
      .fn()
      .mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
    mockUpdate = db.update as jest.Mock;
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it('closes expired active chat sessions older than 24 hours', async () => {
    const { chatSessionService } = await import('../chatSession.service');

    const expiredCount = await chatSessionService.closeExpiredChatSessions();

    expect(expiredCount).toBe(2);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({
      status: 'ended',
      endedAt: expect.any(Date),
    });
    expect(mockUpdateWhere).toHaveBeenCalledWith(expect.anything());
  });

  it('expires an active chat when it is older than 24 hours', async () => {
    const { chatSessionService } = await import('../chatSession.service');

    const expiredChat = {
      id: 'chat-1',
      status: 'active',
      startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    } as any;
    mockUpdateReturning.mockResolvedValueOnce([
      {
        ...expiredChat,
        status: 'ended',
        endedAt: new Date(),
      },
    ]);

    const result =
      await chatSessionService.expireChatSessionIfNeeded(expiredChat);

    expect(result.status).toBe('ended');
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({
      status: 'ended',
      endedAt: expect.any(Date),
    });
  });
});

describe('CronService', () => {
  const userServiceMock = {
    purgeExpiredDeletedAccounts: jest.fn().mockResolvedValue(0),
  };
  const chatSessionServiceMock = {
    closeExpiredChatSessions: jest.fn().mockResolvedValue(3),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    userServiceMock.purgeExpiredDeletedAccounts.mockResolvedValue(0);
    chatSessionServiceMock.closeExpiredChatSessions.mockResolvedValue(3);

    jest.doMock('../user.service', () => ({
      userService: userServiceMock,
    }));
    jest.doMock('../chatSession.service', () => ({
      chatSessionService: chatSessionServiceMock,
    }));
  });

  it('schedules daily purge and hourly expired chat cleanup jobs', async () => {
    const { cronService } = await import('../cron.service');
    const cron = await import('node-cron');

    cronService.init();

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenNthCalledWith(
      1,
      '0 0 * * *',
      expect.any(Function)
    );
    expect(scheduleMock).toHaveBeenNthCalledWith(
      2,
      '0 * * * *',
      expect.any(Function)
    );

    const hourlyJobCallback = scheduleMock.mock
      .calls[1][1] as () => Promise<void>;
    await hourlyJobCallback();

    expect(chatSessionServiceMock.closeExpiredChatSessions).toHaveBeenCalled();
  });
});
