import { z } from 'zod';

export const createReportSchema = z.object({
    type: z.enum(['bug', 'complaint', 'feature_request', 'other'], {
        error: "Type must be one of: bug, complaint, feature_request, other"
    }),
    subject: z.string().min(5, 'Subject must be at least 5 characters').max(255),
    description: z.string().min(10, 'Description must be at least 10 characters'),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
