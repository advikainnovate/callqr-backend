import { jest } from '@jest/globals';

type AnyMock = jest.Mock<any>;

const mockSelect: AnyMock = jest.fn();
const mockInsert: AnyMock = jest.fn();
const mockUpdate: AnyMock = jest.fn();
const mockGetUserById: AnyMock = jest.fn();

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

jest.mock('../../config', () => ({
  appConfig: {
    backendUrl: 'https://example.com',
  },
}));

describe('QRCodeService Unit Tests', () => {
  let qrCodeService: any;
  let mockFrom: AnyMock;
  let mockWhere: AnyMock;
  let mockOrderBy: AnyMock;
  let mockLimit: AnyMock;
  let mockValues: AnyMock;
  let mockReturning: AnyMock;
  let mockSet: AnyMock;
  let mockUpdateWhere: AnyMock;
  let mockOrderByResult: any;

  const setupDbMocks = () => {
    mockOrderByResult = [];
    mockLimit.mockReset().mockResolvedValue([]);

    mockOrderBy.mockReset().mockImplementation(() => ({
      limit: mockLimit,
      then: (resolve: any) => Promise.resolve(mockOrderByResult).then(resolve),
    }));

    mockWhere.mockReset().mockImplementation(() => ({
      limit: mockLimit,
      orderBy: mockOrderBy,
      then: (resolve: any) => Promise.resolve([]).then(resolve),
    }));

    mockFrom.mockReset().mockReturnValue({
      where: mockWhere,
      limit: mockLimit,
    });

    mockSelect.mockReset().mockReturnValue({
      from: mockFrom,
    });

    mockReturning.mockReset().mockResolvedValue([]);
    mockValues.mockReset().mockReturnValue({
      returning: mockReturning,
    });
    mockInsert.mockReset().mockReturnValue({
      values: mockValues,
    });

    mockUpdateWhere.mockReset().mockReturnValue({
      returning: mockReturning,
    });
    mockSet.mockReset().mockReturnValue({
      where: mockUpdateWhere,
    });
    mockUpdate.mockReset().mockReturnValue({
      set: mockSet,
    });
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

    const serviceModule = await import('../qrCode.service');
    qrCodeService = serviceModule.qrCodeService;
  });

  it('should generate sequential printing batch numbers correctly', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const result = await (qrCodeService as any).generateBatchNumber(
      'printing',
      new Date('2026-05-26T12:00:00.000Z')
    );

    expect(result).toBe('PR-260526-001');
  });

  it('should generate the next sequential batch number when a batch already exists', async () => {
    mockOrderByResult = [
      { batchNumber: 'PR-260526-003' },
      { batchNumber: 'PR-260526-002' },
    ];

    const result = await (qrCodeService as any).generateBatchNumber(
      'printing',
      new Date('2026-05-26T12:00:00.000Z')
    );

    expect(result).toBe('PR-260526-004');
  });

  it('should create a QR code batch and associated QR codes for allowed count', async () => {
    const batch = {
      id: 'batch-1',
      batchNumber: 'DG-260526-001',
      purpose: 'digital',
      status: 'generated',
      quantity: 10,
    };

    const qrCodes = Array.from({ length: 10 }, (_, index) => ({
      id: `qr-${index + 1}`,
      token: `token-${index + 1}`,
      humanToken: `QR-TEST-${String(index + 1).padStart(4, '0')}`,
      batchId: 'batch-1',
      status: 'unassigned',
    }));

    mockReturning.mockResolvedValueOnce([batch]);
    qrCodes.forEach(qr => mockReturning.mockResolvedValueOnce([qr]));

    const result = await qrCodeService.createQRCodeBatch({
      count: 10,
      purpose: 'digital',
    });

    expect(result.batch).toEqual(batch);
    expect(result.qrCodes).toHaveLength(10);
    expect(mockInsert).toHaveBeenCalledTimes(11);
  });

  it('should reject QR batch creation for unsupported batch count', async () => {
    await expect(
      qrCodeService.createQRCodeBatch({
        count: 7,
        purpose: 'printing',
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Count must be one of'),
    });
  });

  it('should generate human tokens without ambiguous characters', () => {
    const token = (qrCodeService as any).generateHumanToken();

    expect(token).toMatch(/^QR-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    expect(token).not.toContain('0');
    expect(token).not.toContain('O');
    expect(token).not.toContain('1');
    expect(token).not.toContain('I');
    expect(token).not.toContain('L');
  });

  it('should prevent inactive users from claiming a QR code', async () => {
    mockGetUserById.mockResolvedValue({ id: 'user-1', status: 'deleted' });

    await expect(
      qrCodeService.claimQRCode('user-1', undefined, 'QR-AAAA-BBBB')
    ).rejects.toMatchObject({
      message: 'Cannot claim QR code with inactive account',
    });
  });

  it('should prevent claiming if the user already has an active or disabled QR code', async () => {
    mockGetUserById.mockResolvedValue({ id: 'user-1', status: 'active' });
    const spyUserQRCodes = jest
      .spyOn(qrCodeService as any, 'getUserQRCodes')
      .mockResolvedValue([{ status: 'active' }]);

    mockSelect.mockReturnValue({ from: mockFrom });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([{ id: 'qr-1', status: 'unassigned' }]);

    await expect(
      qrCodeService.claimQRCode('user-1', undefined, 'QR-AAAA-BBBB')
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'You already have an active or disabled QR code'
      ),
    });

    spyUserQRCodes.mockRestore();
  });

  it('should claim a QR code successfully by human token', async () => {
    mockGetUserById.mockResolvedValue({ id: 'user-1', status: 'active' });
    jest.spyOn(qrCodeService as any, 'getUserQRCodes').mockResolvedValue([]);
    jest
      .spyOn(qrCodeService as any, 'refreshDigitalBatchStatus')
      .mockResolvedValue(undefined);

    mockLimit.mockResolvedValueOnce([
      {
        id: 'qr-1',
        status: 'unassigned',
        humanToken: 'QR-AAAA-BBBB',
        batchId: 'batch-1',
      },
    ]);
    mockReturning.mockResolvedValueOnce([
      {
        id: 'qr-1',
        status: 'active',
        assignedUserId: 'user-1',
        batchId: 'batch-1',
      },
    ]);

    const claimed = await qrCodeService.claimQRCode(
      'user-1',
      undefined,
      'QR-AAAA-BBBB'
    );

    expect(claimed.status).toBe('active');
    expect(claimed.assignedUserId).toBe('user-1');
  });

  it('should scan an active QR code and return owner details', async () => {
    const qrCode = {
      id: 'qr-1',
      status: 'active',
      assignedUserId: 'user-1',
      humanToken: 'QR-AAAA-BBBB',
      token: 'abcdef'.repeat(10),
    };

    mockSelect.mockReturnValue({ from: mockFrom });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([qrCode]);
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      username: 'tester',
      status: 'active',
      createdAt: new Date('2026-05-26T12:00:00Z'),
    });

    const result = await qrCodeService.scanQRCode(undefined, 'QR-AAAA-BBBB');

    expect(result.user).toMatchObject({ id: 'user-1', username: 'tester' });
    expect(result.qrCode.id).toBe('qr-1');
  });

  it('should reject invalid QR token formats when scanning', async () => {
    await expect(
      qrCodeService.scanQRCode('invalid-token', undefined)
    ).rejects.toMatchObject({
      message: 'Invalid QR token format',
    });
  });

  it('should revoke a QR code successfully', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'qr-1', status: 'revoked' }]);

    const revoked = await qrCodeService.revokeQRCode('qr-1', 'user-1');

    expect(revoked.status).toBe('revoked');
  });

  it('should generate a QR image data URL for a valid token', async () => {
    const rawToken = 'a'.repeat(64);
    const result = await qrCodeService.generateQRCodeImage(rawToken);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should generate a QR PNG buffer for a valid token', async () => {
    const rawToken = 'b'.repeat(64);
    const result = await qrCodeService.generateQRCodeBuffer(rawToken);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
