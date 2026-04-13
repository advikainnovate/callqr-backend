import { z } from 'zod';

export const initiateCallSchema = z.object({
  body: z.object({
    qrToken: z.string().min(1).max(255),
  }),
});

export const initiateCallFromChatSchema = z.object({
  body: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const updateCallStatusSchema = z.object({
  body: z.object({
    status: z.enum(['ringing', 'connected']),
  }),
  params: z.object({
    callId: z.string().uuid(),
  }),
});

export const getCallSessionSchema = z.object({
  params: z.object({
    callId: z.string().uuid(),
  }),
});

export const endCallSchema = z.object({
  body: z.object({
    reason: z
      .enum(['busy', 'rejected', 'timeout', 'error', 'completed'])
      .optional(),
  }),
  params: z.object({
    callId: z.string().uuid(),
  }),
});

export const acceptCallSchema = z.object({
  params: z.object({
    callId: z.string().uuid(),
  }),
});

export const rejectCallSchema = z.object({
  params: z.object({
    callId: z.string().uuid(),
  }),
});

export const getCallHistorySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
