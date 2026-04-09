jest.mock('../chatSession.service', () => ({
  chatSessionService: {
    verifyParticipant: jest.fn(),
    getChatSessionById: jest.fn(),
    getUserChatSessions: jest.fn(),
  },
}));

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('../subscription.service', () => ({
  subscriptionService: {
    getUserPlan: jest.fn(),
  },
}));

jest.mock('../user.service', () => ({
  userService: {
    isUserBlocked: jest.fn(),
  },
}));

jest.mock('../media.service', () => ({
  mediaService: {
    uploadImages: jest.fn(),
    generateImageUrls: jest.fn(),
  },
}));

describe('MessageService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('rejects unsupported public message types', async () => {
    const { messageService } = await import('../message.service');
    const { chatSessionService } = await import('../chatSession.service');
    const { userService } = await import('../user.service');

    (chatSessionService.verifyParticipant as jest.Mock).mockResolvedValue(true);
    (chatSessionService.getChatSessionById as jest.Mock).mockResolvedValue({
      id: 'chat-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
      status: 'active',
    });
    (userService.isUserBlocked as jest.Mock).mockResolvedValue(false);
    jest
      .spyOn(messageService as any, 'checkDailyMessageLimit')
      .mockResolvedValue(undefined);

    await expect(
      messageService.sendMessage(
        'chat-1',
        'user-1',
        'system text',
        'system' as any
      )
    ).rejects.toMatchObject({ message: 'Unsupported message type' });
  });

  it('requires uploaded images for image messages', async () => {
    const { messageService } = await import('../message.service');
    const { chatSessionService } = await import('../chatSession.service');
    const { userService } = await import('../user.service');

    (chatSessionService.verifyParticipant as jest.Mock).mockResolvedValue(true);
    (chatSessionService.getChatSessionById as jest.Mock).mockResolvedValue({
      id: 'chat-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
      status: 'active',
    });
    (userService.isUserBlocked as jest.Mock).mockResolvedValue(false);
    jest
      .spyOn(messageService as any, 'checkDailyMessageLimit')
      .mockResolvedValue(undefined);

    await expect(
      messageService.sendMessage('chat-1', 'user-1', '', 'image')
    ).rejects.toMatchObject({
      message: 'At least one image is required for image messages',
    });
  });

  it('counts unread messages across all chats without relying on paginated chat lists', async () => {
    const { messageService } = await import('../message.service');
    const { chatSessionService } = await import('../chatSession.service');
    const { db } = await import('../../db');

    const where = jest.fn().mockResolvedValue([{ count: 73 }]);
    const innerJoin = jest.fn().mockReturnValue({ where });
    const from = jest.fn().mockReturnValue({ innerJoin });
    (db.select as jest.Mock).mockReturnValue({ from });

    const result = await messageService.getUnreadCount('user-1');

    expect(result).toBe(73);
    expect(chatSessionService.getUserChatSessions).not.toHaveBeenCalled();
    expect(db.select).toHaveBeenCalled();
    expect(from).toHaveBeenCalled();
    expect(innerJoin).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });
});
