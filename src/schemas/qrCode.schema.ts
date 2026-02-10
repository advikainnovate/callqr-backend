import { z } from 'zod';

export const createQRCodeSchema = z.object({
  body: z.object({}).optional(),
});

export const assignQRCodeSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
  }),
  params: z.object({
    qrCodeId: z.string().uuid(),
  }),
});

export const scanQRCodeSchema = z.object({
  body: z.object({
    token: z.string().length(64),
  }),
});

export const getQRCodeByTokenSchema = z.object({
  params: z.object({
    token: z.string().length(64),
  }),
});

export const revokeQRCodeSchema = z.object({
  params: z.object({
    qrCodeId: z.string().uuid(),
  }),
});

export const disableQRCodeSchema = z.object({
  params: z.object({
    qrCodeId: z.string().uuid(),
  }),
});

export const reactivateQRCodeSchema = z.object({
  params: z.object({
    qrCodeId: z.string().uuid(),
  }),
});

export const getQRCodeImageSchema = z.object({
  params: z.object({
    token: z.string().length(64),
  }),
});
