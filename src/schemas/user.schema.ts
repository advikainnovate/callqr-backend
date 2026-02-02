import { z } from 'zod';

export const registerUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phoneNo: z.string().regex(/^\+?[\d\s-]{10,}$/, 'Invalid phone number format'),
  emergencyNo: z.string().optional(),
  vehicleType: z.enum(['two_wheeler', 'four_wheeler', 'public_vehicle']),
});

export const loginUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  username: z.string().optional(),
  password: z.string(),
}).refine(data => data.email || data.username, {
  message: "Either email or username must be provided",
  path: ["email"]
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
