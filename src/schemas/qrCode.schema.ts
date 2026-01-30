import { z } from 'zod';

export const createQRCodeSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

export const scanQRCodeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type CreateQRCodeInput = z.infer<typeof createQRCodeSchema>;
export type ScanQRCodeInput = z.infer<typeof scanQRCodeSchema>;
