jest.mock('../chatSession.service', () => ({
  chatSessionService: {
    verifyParticipant: jest.fn(),
    getChatSessionById: jest.fn(),
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
});
