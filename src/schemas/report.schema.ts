import { z } from 'zod';

export const createBugReportSchema = z.object({
  body: z.object({
    description: z.string().min(10).max(5000),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  }),
});

export const getBugReportSchema = z.object({
  params: z.object({
    reportId: z.string().uuid(),
  }),
});

export const updateBugReportStatusSchema = z.object({
  body: z.object({
    status: z.enum(['open', 'in_progress', 'resolved']),
  }),
  params: z.object({
    reportId: z.string().uuid(),
  }),
});

export const updateBugReportSeveritySchema = z.object({
  body: z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  params: z.object({
    reportId: z.string().uuid(),
  }),
});

export const getBugReportsBySeveritySchema = z.object({
  params: z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  }),
});

export const getBugReportsByStatusSchema = z.object({
  params: z.object({
    status: z.enum(['open', 'in_progress', 'resolved']),
  }),
});
