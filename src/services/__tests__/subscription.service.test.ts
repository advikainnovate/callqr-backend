import { jest } from '@jest/globals';

type AnyMock = jest.Mock<any>;

const mockSelect: AnyMock = jest.fn();
const mockInsert: AnyMock = jest.fn();
const mockUpdate: AnyMock = jest.fn();
const mockGetUserById: AnyMock = jest.fn();
const mockGetActiveChatCount: AnyMock = jest.fn();
const mockGetDailyMessageCount: AnyMock = jest.fn();

jest.mock('../../db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

jest.mock('../user.service', () => ({
  userService: {
    getUserById: mockGetUserById,
  },
}));

jest.mock('../chatSession.service', () => ({
  chatSessionService: {
    getActiveChatCount: mockGetActiveChatCount,
  },
}));

jest.mock('../message.service', () => ({
  messageService: {
    getDailyMessageCount: mockGetDailyMessageCount,
  },
}));

jest.mock('../../models', () => ({
  subscriptions: {},
  callSessions: {},
}));

describe('SubscriptionService Unit Tests', () => {
  let subscriptionService: any;
  let mockFrom: AnyMock;
  let mockWhere: AnyMock;
  let mockOrderBy: AnyMock;
  let mockLimit: AnyMock;
  let mockValues: AnyMock;
  let mockReturning: AnyMock;
  let mockSet: AnyMock;
  let mockUpdateWhere: AnyMock;
  let mockWhereResult: any;

  const setupDbMocks = () => {
    mockLimit.mockReset().mockResolvedValue([]);
    mockOrderBy.mockReset().mockReturnValue({ limit: mockLimit });
    mockWhereResult = [];
    mockWhere.mockReset().mockImplementation(() => ({
      limit: mockLimit,
      orderBy: mockOrderBy,
      then: (resolve: any) => Promise.resolve(mockWhereResult).then(resolve),
    }));
    mockFrom
      .mockReset()
      .mockReturnValue({
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
      });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockReturning.mockReset().mockResolvedValue([]);
    mockValues.mockReset().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReset().mockReturnValue({ values: mockValues });
    mockUpdateWhere.mockReset().mockReturnValue({ returning: mockReturning });
    mockSet.mockReset().mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReset().mockReturnValue({ set: mockSet });
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFrom = jest.fn();
    mockWhere = jest.fn();
    mockOrderBy = jest.fn();
    mockLimit = jest.fn();
    mockValues = jest.fn();
    mockReturning = jest.fn();
    mockSet = jest.fn();
    mockUpdateWhere = jest.fn();

    setupDbMocks();

    const serviceModule = await import('../subscription.service');
    subscriptionService = serviceModule.subscriptionService;
  });

  it('should create a subscription when no active subscription exists', async () => {
    mockGetUserById.mockResolvedValue({ id: 'user-1' });
    mockLimit.mockResolvedValueOnce([]);
    const created = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'free',
      status: 'active',
    };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await subscriptionService.createSubscription('user-1');

    expect(result).toEqual(created);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('should reject creation when an active subscription already exists', async () => {
    mockGetUserById.mockResolvedValue({ id: 'user-1' });
    mockLimit.mockResolvedValueOnce([
      { id: 'sub-1', userId: 'user-1', status: 'active' },
    ]);

    await expect(
      subscriptionService.createSubscription('user-1')
    ).rejects.toMatchObject({
      message: 'User already has an active subscription',
    });
  });

  it('should expire a subscription when its expiry date has passed', async () => {
    const expired = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'free',
      status: 'active',
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    };
    mockLimit.mockResolvedValueOnce([expired]);
    mockReturning.mockResolvedValueOnce([{ ...expired, status: 'expired' }]);

    const result = await subscriptionService.getActiveSubscription('user-1');

    expect(result).toBeNull();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should upgrade a user plan by canceling the current subscription and creating a new one', async () => {
    const activeSub = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'free',
      status: 'active',
    };
    const newSub = {
      id: 'sub-2',
      userId: 'user-1',
      plan: 'pro',
      status: 'active',
    };

    jest
      .spyOn(subscriptionService, 'getActiveSubscription')
      .mockResolvedValue(activeSub);
    jest
      .spyOn(subscriptionService, 'cancelSubscription')
      .mockResolvedValue(activeSub);
    jest
      .spyOn(subscriptionService, 'createSubscription')
      .mockResolvedValue(newSub);

    const result = await subscriptionService.upgradePlan('user-1', 'pro');

    expect(result).toEqual(newSub);
    expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(
      'sub-1'
    );
  });

  it('should reject downgrade when no active subscription exists', async () => {
    jest
      .spyOn(subscriptionService, 'getActiveSubscription')
      .mockResolvedValue(null);

    await expect(
      subscriptionService.downgradePlan('user-1', 'free')
    ).rejects.toMatchObject({
      message: 'No active subscription to downgrade',
    });
  });

  it('should reject downgrade when target plan is not lower than current plan', async () => {
    const activeSub = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'pro',
      status: 'active',
    };
    jest
      .spyOn(subscriptionService, 'getActiveSubscription')
      .mockResolvedValue(activeSub);

    await expect(
      subscriptionService.downgradePlan('user-1', 'pro')
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'New plan must be lower than current plan'
      ),
    });
  });

  it('should reject downgrade if usage exceeds target plan limits', async () => {
    const activeSub = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'pro',
      status: 'active',
    };
    jest
      .spyOn(subscriptionService, 'getActiveSubscription')
      .mockResolvedValue(activeSub);
    jest
      .spyOn(subscriptionService, 'validateDowngrade')
      .mockRejectedValue(
        new Error('Cannot downgrade: Current usage exceeds new plan limits.')
      );

    await expect(
      subscriptionService.downgradePlan('user-1', 'free')
    ).rejects.toMatchObject({
      message: expect.stringContaining('Cannot downgrade'),
    });
  });

  it('should report downgrade eligibility as false when call usage exceeds free plan', async () => {
    const activeSub = {
      id: 'sub-1',
      userId: 'user-1',
      plan: 'pro',
      status: 'active',
    };
    jest
      .spyOn(subscriptionService, 'getActiveSubscription')
      .mockResolvedValue(activeSub);
    jest
      .spyOn(subscriptionService, 'getCallUsage')
      .mockResolvedValue({ used: 60, limit: 80, plan: 'pro', remaining: 20 });
    mockGetActiveChatCount.mockResolvedValue(0);
    mockGetDailyMessageCount.mockResolvedValue(0);

    const result = await subscriptionService.getDowngradeEligibility(
      'user-1',
      'free'
    );

    expect(result.eligible).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.currentUsage.calls.used).toBe(60);
  });

  it('should throw TooManyRequestsError when the daily call limit is reached', async () => {
    jest.spyOn(subscriptionService, 'getDailyCallLimit').mockResolvedValue(50);
    jest.spyOn(subscriptionService, 'getUserPlan').mockResolvedValue('free');
    mockWhereResult = [{ count: 50 }];

    await expect(
      subscriptionService.checkDailyCallLimit('user-1')
    ).rejects.toMatchObject({
      message: expect.stringContaining('Daily call limit reached'),
    });
  });

  it('should calculate call usage and remaining allowance correctly', async () => {
    jest.spyOn(subscriptionService, 'getUserPlan').mockResolvedValue('free');
    mockWhereResult = [{ count: 20 }];

    const result = await subscriptionService.getCallUsage('user-1');

    expect(result.used).toBe(20);
    expect(result.remaining).toBe(30);
  });
});
