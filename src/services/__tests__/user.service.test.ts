import bcrypt from 'bcrypt';

describe('UserService Unit Tests', () => {
  let userService: any;
  let db: any;

  // Chain mock functions
  let mockLimit: jest.Mock;
  let mockOffset: jest.Mock;
  let mockOrderBy: jest.Mock;
  let mockWhere: jest.Mock;
  let mockFrom: jest.Mock;
  let mockReturning: jest.Mock;
  let mockValues: jest.Mock;
  let mockSet: jest.Mock;
  let mockUpdateWhere: jest.Mock;
  let mockDeleteWhere: jest.Mock;

  beforeEach(async () => {
    // Reset module cache to remove real modules loaded by setup.ts
    jest.resetModules();
    jest.clearAllMocks();

    // Define mock chains
    mockLimit = jest.fn().mockResolvedValue([]);
    mockOffset = jest.fn().mockResolvedValue([]);
    mockOrderBy = jest.fn().mockReturnValue({
      limit: mockLimit,
      offset: mockOffset,
    });
    mockWhere = jest.fn().mockReturnValue({
      limit: mockLimit,
      offset: mockOffset,
      orderBy: mockOrderBy,
    });
    mockFrom = jest.fn().mockReturnValue({
      where: mockWhere,
      limit: mockLimit,
    });

    mockReturning = jest.fn().mockResolvedValue([]);
    mockValues = jest.fn().mockReturnValue({
      returning: mockReturning,
    });

    mockUpdateWhere = jest.fn().mockReturnValue({
      returning: mockReturning,
    });
    mockSet = jest.fn().mockReturnValue({
      where: mockUpdateWhere,
    });

    mockDeleteWhere = jest.fn().mockResolvedValue(undefined);

    // Apply inline mock dynamically before importing modules
    jest.doMock('../../db', () => ({
      db: {
        select: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    }));

    // Import db and userService in isolation
    const dbModule = await import('../../db');
    db = dbModule.db;

    const userModule = await import('../user.service');
    userService = userModule.userService;

    // Bind mock implementations to mocked db methods
    (db.select as jest.Mock).mockReturnValue({
      from: mockFrom,
    });

    (db.insert as jest.Mock).mockReturnValue({
      values: mockValues,
    });

    (db.update as jest.Mock).mockReturnValue({
      set: mockSet,
    });

    (db.delete as jest.Mock).mockReturnValue({
      where: mockDeleteWhere,
    });
  });

  describe('Email Normalization', () => {
    it('should normalize Gmail addresses correctly (ignore dots and aliases)', () => {
      const normalizeEmail = (userService as any).normalizeEmail;
      expect(normalizeEmail('John.Doe+alias@gmail.com')).toBe(
        'johndoe@gmail.com'
      );
      expect(normalizeEmail('JOHN.doe@googlemail.com')).toBe(
        'johndoe@gmail.com'
      );
      expect(normalizeEmail('  j.o.h.n.d.o.e@gmail.com  ')).toBe(
        'johndoe@gmail.com'
      );
    });

    it('should normalize non-Gmail addresses correctly (keep dots, ignore aliases)', () => {
      const normalizeEmail = (userService as any).normalizeEmail;
      expect(normalizeEmail('John.Doe+alias@yahoo.com')).toBe(
        'john.doe@yahoo.com'
      );
      expect(normalizeEmail('john.doe@outlook.com')).toBe(
        'john.doe@outlook.com'
      );
    });
  });

  describe('User Creation', () => {
    it('should throw ConflictError if username already exists', async () => {
      mockLimit.mockResolvedValueOnce([{ id: 'user-1', username: 'testuser' }]);

      await expect(
        userService.createUser({
          username: 'testuser',
          password: 'password123',
        })
      ).rejects.toMatchObject({ message: 'Username already exists' });
    });

    it('should throw BadRequestError if password is less than 6 characters', async () => {
      mockLimit.mockResolvedValueOnce([]); // username available

      await expect(
        userService.createUser({
          username: 'testuser',
          password: '123',
        })
      ).rejects.toMatchObject({
        message: 'Password must be at least 6 characters long',
      });
    });

    it('should create a new user with FREE subscription and hashed password', async () => {
      mockLimit.mockResolvedValue([]); // Username and email available
      const fakeUser = {
        id: 'new-user-uuid',
        username: 'testuser',
        passwordHash: 'hashed-password',
        phone: null,
        email: null,
        status: 'pending_verification',
        isPhoneVerified: 'true',
        isEmailVerified: 'false',
        createdAt: new Date(),
      };
      mockReturning.mockResolvedValueOnce([fakeUser]); // user record returned

      const user = await userService.createUser({
        username: 'testuser',
        password: 'password123',
      });

      expect(user.username).toBe('testuser');
      expect(db.insert).toHaveBeenCalledTimes(2); // once for user, once for default FREE subscription
      expect(mockValues).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    const makeUser = (overrides = {}) => ({
      id: 'user-1',
      username: 'testuser',
      passwordHash: bcrypt.hashSync('password123', 10),
      status: 'active',
      isGloballyBlocked: 'false',
      isEmailVerified: 'true',
      isPhoneVerified: 'true',
      createdAt: new Date(),
      ...overrides,
    });

    it('should fail with UnauthorizedError if user not found', async () => {
      mockLimit.mockResolvedValueOnce([]); // username/phone/email not found

      await expect(
        userService.authenticateUser('nonexistent', 'password123')
      ).rejects.toMatchObject({ message: 'Invalid credentials' });
    });

    it('should fail with ForbiddenError if user is globally blocked', async () => {
      const blockedUser = makeUser({
        isGloballyBlocked: 'true',
        globalBlockReason: 'Spamming calls',
      });
      mockLimit.mockResolvedValueOnce([blockedUser]);

      await expect(
        userService.authenticateUser('testuser', 'password123')
      ).rejects.toMatchObject({
        message: 'Your account has been globally blocked: Spamming calls',
      });
    });

    it('should delete unverified account and reject if pending verification is expired', async () => {
      const expiredUser = makeUser({
        status: 'pending_verification',
        isEmailVerified: 'false',
        isPhoneVerified: 'false',
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago (limit is 7)
      });
      mockLimit.mockResolvedValueOnce([expiredUser]);

      await expect(
        userService.authenticateUser('testuser', 'password123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('Account verification window expired'),
      });

      expect(db.delete).toHaveBeenCalled();
    });

    it('should authenticate successfully with correct password', async () => {
      const activeUser = makeUser();
      mockLimit.mockResolvedValueOnce([activeUser]);

      const authenticated = await userService.authenticateUser(
        'testuser',
        'password123'
      );
      expect(authenticated.id).toBe('user-1');
    });

    it('should fail with UnauthorizedError with wrong password', async () => {
      const activeUser = makeUser();
      mockLimit.mockResolvedValueOnce([activeUser]);

      await expect(
        userService.authenticateUser('testuser', 'wrongpassword')
      ).rejects.toMatchObject({ message: 'Invalid credentials' });
    });
  });

  describe('User Operations & Decryption', () => {
    it('should return decrypted profile email and phone numbers', async () => {
      const encryptData = (userService as any).encryptData.bind(userService);
      const testPhone = '+1234567890';
      const testEmail = 'user@example.com';

      const fakeUser = {
        id: 'user-1',
        username: 'testuser',
        phone: encryptData(testPhone),
        email: encryptData(testEmail),
        isEmailVerified: 'true',
        isPhoneVerified: 'true',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockLimit.mockResolvedValueOnce([fakeUser]);

      const profile = await userService.getUserProfile('user-1');
      expect(profile.phone).toBe(testPhone);
      expect(profile.email).toBe(testEmail);
    });

    it('should successfully soft delete a user', async () => {
      const deletedUser = {
        id: 'user-1',
        status: 'deleted',
        deletedAt: new Date(),
      };
      mockReturning.mockResolvedValueOnce([deletedUser]);

      const deleted = await userService.deleteUser('user-1');
      expect(deleted.status).toBe('deleted');
      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          deletedAt: expect.any(Date),
        })
      );
    });

    it('should permanently delete user blocks, subscriptions, and user details in hardDeleteUser', async () => {
      await userService.hardDeleteUser('user-1');
      expect(db.delete).toHaveBeenCalledTimes(4); // deviceTokens, userBlocks blocker, userBlocks blocked, subscriptions, users
    });
  });

  describe('Purge Deleted Accounts', () => {
    it('should identify and hard delete soft-deleted accounts older than 7 days', async () => {
      const oldDeletedUser = { id: 'expired-deleted-user-1' };
      // purgeExpiredDeletedAccounts does: await db.select().from().where(...)
      // so mockWhere itself must resolve to the array
      mockWhere.mockResolvedValueOnce([oldDeletedUser]);

      const purgedCount = await userService.purgeExpiredDeletedAccounts();
      expect(purgedCount).toBe(1);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return 0 if no accounts are soft-deleted for more than 7 days', async () => {
      mockWhere.mockResolvedValueOnce([]);

      const purgedCount = await userService.purgeExpiredDeletedAccounts();
      expect(purgedCount).toBe(0);
    });
  });
});
