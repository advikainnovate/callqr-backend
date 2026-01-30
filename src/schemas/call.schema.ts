import { z } from 'zod';

export const initiateCallSchema = z.object({
  qrToken: z.string().min(1, 'QR token is required'),
  callType: z.enum(['webrtc', 'twilio']).default('webrtc'),
});

export const updateCallStatusSchema = z.object({
  status: z.enum(['initiated', 'connected', 'ended', 'failed']),
  duration: z.number().int().min(0).optional(),
});

export const callIdSchema = z.object({
  callId: z.string().uuid('Invalid call ID format'),
});

export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type UpdateCallStatusInput = z.infer<typeof updateCallStatusSchema>;
