import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z.object({
    chatSessionId: z.string().uuid(),
    content: z.string().max(5000).optional(), // Optional for image messages
    messageType: z.enum(['text', 'image', 'file', 'system']).default('text'),
  }).refine((data) => {
    // For text messages, content is required
    if (data.messageType === 'text' && (!data.content || data.content.trim().length === 0)) {
      return false;
    }
    return true;
  }, {
    message: 'Content is required for text messages',
    path: ['content'],
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
  }),
});

export const markAsReadSchema = z.object({
  params: z.object({
    messageId: z.string().uuid(),
  }),
});

export const markChatAsReadSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const deleteMessageSchema = z.object({
  params: z.object({
    messageId: z.string().uuid(),
  }),
});

export const searchMessagesSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
  query: z.object({
    query: z.string().min(1),
  }),
});
