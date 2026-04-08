import { z } from 'zod';

export const initiateChatSchema = z.object({
  body: z.object({
    qrToken: z.string().min(1).max(255),
  }),
});

export const getChatSessionSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const endChatSessionSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const blockChatSessionSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const getMyChatSessionsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
