import { z } from 'zod';

export const createQRCodeSchema = z.object({
  body: z.object({}),
});

export const bulkCreateQRCodeSchema = z.object({
  body: z.object({
    count: z
      .union([
        z.literal(10),
        z.literal(25),
        z.literal(50),
        z.literal(100),
        z.literal(200),
        z.literal(500),
        z.literal(1000),
        z.literal('10'),
        z.literal('25'),
        z.literal('50'),
        z.literal('100'),
        z.literal('200'),
        z.literal('500'),
        z.literal('1000'),
      ])
      .transform(value => parseInt(String(value), 10)),
    purpose: z.enum(['printing', 'digital']).default('digital'),
    notes: z.string().max(500).optional(),
    printJobRef: z.string().max(100).optional(),
  }),
});

export const getQRBatchesSchema = z.object({
  query: z.object({
    purpose: z.enum(['printing', 'digital']).optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    page: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : undefined))
      .pipe(z.number().int().min(1).max(100000).optional()),
    limit: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 50))
      .pipe(z.number().int().min(1).max(100)),
    offset: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 0))
      .pipe(z.number().int().min(0).max(10000)),
    sort: z.enum(['newest', 'oldest']).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getQRBatchDetailsSchema = z.object({
  params: z.object({
    batchId: z.string().uuid(),
  }),
});

export const updateQRBatchStatusSchema = z.object({
  params: z.object({
    batchId: z.string().uuid(),
  }),
  body: z.object({
    status: z.string().min(1).max(30),
    notes: z.string().max(500).optional(),
    printJobRef: z.string().max(100).optional(),
  }),
});

export const downloadQRBatchSchema = z.object({
  params: z.object({
    batchId: z.string().uuid(),
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
