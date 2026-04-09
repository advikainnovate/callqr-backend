import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z
    .object({
      chatSessionId: z.string().uuid(),
      content: z.string().max(5000).optional(), // Optional for image messages
      messageType: z.enum(['text', 'image']).default('text'),
    })
    .refine(
      data => {
        // For text messages, content is required
        if (
          data.messageType === 'text' &&
          (!data.content || data.content.trim().length === 0)
        ) {
          return false;
        }
        return true;
      },
      {
        message: 'Content is required for text messages',
        path: ['content'],
      }
    ),
});

export const getMessagesSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
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

export const markAsDeliveredSchema = z.object({
  params: z.object({
    messageId: z.string().uuid(),
  }),
});

export const markChatAsDeliveredSchema = z.object({
  params: z.object({
    chatSessionId: z.string().uuid(),
  }),
});

export const getDeliveryStatusSchema = z.object({
  params: z.object({
    messageId: z.string().uuid(),
  }),
});
