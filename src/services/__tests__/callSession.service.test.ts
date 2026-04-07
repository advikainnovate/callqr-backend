const mockReturning = jest.fn();
const mockWhere = jest.fn(() => ({ returning: mockReturning }));
const mockSet = jest.fn(() => ({ where: mockWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

jest.mock('../../db', () => ({
  db: {
    update: mockUpdate,
  },
}));

describe('CallSessionService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const makeCall = (overrides: Record<string, unknown> = {}) => ({
    id: 'call-1',
    callerId: 'caller-1',
    guestId: null,
    guestIp: null,
    callerType: 'registered',
    receiverId: 'receiver-1',
    qrId: 'qr-1',
    status: 'ringing',
    endedReason: null,
    initiatedAt: new Date('2026-04-08T10:00:00.000Z'),
    startedAt: null,
    endedAt: null,
    ...overrides,
  });

  it('blocks non-participants from reading a call', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest
      .spyOn(callSessionService, 'getCallSessionById')
      .mockResolvedValue(makeCall() as any);

    await expect(
      callSessionService.getCallSessionForActor('call-1', 'intruder-1')
    ).rejects.toMatchObject({
      message: 'You do not have permission to access this call',
    });
  });

  it('only lets the receiver accept a pending call', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest
      .spyOn(callSessionService, 'getCallSessionById')
      .mockResolvedValue(makeCall({ status: 'ringing' }) as any);

    await expect(
      callSessionService.acceptCall('call-1', 'caller-1')
    ).rejects.toMatchObject({
      message: 'Only the receiver can accept the call',
    });
  });

  it('prevents callers from force-connecting a call through the generic status API', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest
      .spyOn(callSessionService, 'getCallSessionById')
      .mockResolvedValue(makeCall({ status: 'ringing' }) as any);

    await expect(
      callSessionService.updateCallStatus('call-1', 'caller-1', 'connected')
    ).rejects.toMatchObject({
      message: 'Only the receiver can connect the call',
    });
  });

  it('lets the receiver accept a pending call and stamps the start time', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest
      .spyOn(callSessionService, 'getCallSessionById')
      .mockResolvedValue(makeCall({ status: 'ringing' }) as any);

    mockReturning.mockResolvedValueOnce([
      makeCall({
        status: 'connected',
        startedAt: new Date('2026-04-08T10:01:00.000Z'),
      }),
    ]);

    const updated = await callSessionService.acceptCall('call-1', 'receiver-1');

    expect(updated.status).toBe('connected');
    expect(updated.startedAt).toBeInstanceOf(Date);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('prevents rejecting a call that has already finished', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest
      .spyOn(callSessionService, 'getCallSessionById')
      .mockResolvedValue(
        makeCall({ status: 'ended', endedAt: new Date() }) as any
      );

    await expect(
      callSessionService.rejectCall('call-1', 'receiver-1')
    ).rejects.toMatchObject({ message: 'Call has already finished' });
  });

  it('allows the guest caller to ring but not accept their own call', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest.spyOn(callSessionService, 'getCallSessionById').mockResolvedValue(
      makeCall({
        callerId: null,
        guestId: 'guest-1',
        callerType: 'anonymous',
        status: 'initiated',
      }) as any
    );

    mockReturning.mockResolvedValueOnce([
      makeCall({
        callerId: null,
        guestId: 'guest-1',
        callerType: 'anonymous',
        status: 'ringing',
      }),
    ]);

    const ringing = await callSessionService.updateCallStatus(
      'call-1',
      'guest:guest-1',
      'ringing'
    );

    expect(ringing.status).toBe('ringing');

    await expect(
      callSessionService.acceptCall('call-1', 'guest:guest-1')
    ).rejects.toMatchObject({
      message: 'Only the receiver can accept the call',
    });
  });

  it('allows a participant to end a connected call with completed reason', async () => {
    const { callSessionService } = await import('../callSession.service');
    jest.spyOn(callSessionService, 'getCallSessionById').mockResolvedValue(
      makeCall({
        status: 'connected',
        startedAt: new Date('2026-04-08T10:01:00.000Z'),
      }) as any
    );

    mockReturning.mockResolvedValueOnce([
      makeCall({
        status: 'ended',
        endedReason: 'completed',
        startedAt: new Date('2026-04-08T10:01:00.000Z'),
        endedAt: new Date('2026-04-08T10:05:00.000Z'),
      }),
    ]);

    const ended = await callSessionService.endCall(
      'call-1',
      'caller-1',
      'completed'
    );

    expect(ended.status).toBe('ended');
    expect(ended.endedReason).toBe('completed');
  });
});
