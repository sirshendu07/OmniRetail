import { z } from 'zod';
import { ALL_ROLES } from '../../common/constants/roles.js';

const passwordValidation = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address').trim().toLowerCase(),
    password: passwordValidation,
    firstName: z.string().min(1, 'First name is required').max(50).trim(),
    lastName: z.string().min(1, 'Last name is required').max(50).trim(),
    phone: z.string().optional(),
    role: z.enum(ALL_ROLES).optional()
  })
});

export const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().toLowerCase(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 numeric digits')
  })
});

export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().toLowerCase()
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().toLowerCase(),
    password: z.string().min(1, 'Password is required')
  })
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().toLowerCase()
  })
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().toLowerCase(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 numeric digits'),
    newPassword: passwordValidation
  })
});
