import { z } from 'zod';

export const createQRCodeSchema = z.object({
  body: z.object({
    redirectUrl: z.string().url().nullable().optional(),
    isRedirectEnabled: z.boolean().optional(),
  }),
});

export const bulkCreateQRCodeSchema = z.object({
  body: z.object({
    count: z.number().int().min(1).max(2000),
    redirectUrl: z.string().url().nullable().optional(),
    isRedirectEnabled: z.boolean().optional(),
  }),
});

export const claimQRCodeSchema = z.object({
  body: z
    .object({
      token: z.string().min(1).max(255).optional(),
      humanToken: z
        .string()
        .regex(
          /^QR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/i
        )
        .optional(),
    })
    .refine(data => data.token || data.humanToken, {
      message: 'Either token or humanToken must be provided',
    }),
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
  body: z
    .object({
      token: z.string().min(1).max(255).optional(),
      humanToken: z
        .string()
        .regex(
          /^QR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/i
        )
        .optional(),
    })
    .refine(data => data.token || data.humanToken, {
      message: 'Either token or humanToken must be provided',
    }),
});

export const getQRCodeByTokenSchema = z.object({
  params: z.object({
    token: z.string().min(1).max(255),
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
    token: z.string().min(1).max(255),
  }),
});

export const getUnassignedQRCodesSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 50))
      .pipe(z.number().int().min(1).max(100)),
    cursor: z.string().optional(),
  }),
});
