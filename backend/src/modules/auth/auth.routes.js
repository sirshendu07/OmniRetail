import { Router } from 'express';
import * as authController from './auth.controller.js';
import * as validator from './auth.validator.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import { createRateLimiter } from '../../common/middleware/rateLimiter.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const authRouter = Router();

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'rate:auth' });
const otpLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'rate:otp' });

// Public authentication lifecycle routes
authRouter.post('/register', authLimiter, validateRequest(validator.registerSchema), asyncHandler(authController.register));
authRouter.post('/verify-email', validateRequest(validator.verifyEmailSchema), asyncHandler(authController.verifyEmail));
authRouter.post('/resend-otp', otpLimiter, validateRequest(validator.resendOtpSchema), asyncHandler(authController.resendOtp));
authRouter.post('/login', authLimiter, validateRequest(validator.loginSchema), asyncHandler(authController.login));
authRouter.post('/refresh', asyncHandler(authController.refresh));
authRouter.post('/forgot-password', authLimiter, validateRequest(validator.forgotPasswordSchema), asyncHandler(authController.forgotPassword));
authRouter.post('/reset-password', validateRequest(validator.resetPasswordSchema), asyncHandler(authController.resetPassword));

// Authenticated session management routes
authRouter.post('/logout', authenticate, csrfProtection, asyncHandler(authController.logout));
authRouter.post('/logout-all', authenticate, csrfProtection, asyncHandler(authController.logoutAll));
authRouter.get('/sessions', authenticate, asyncHandler(authController.getSessions));
authRouter.delete('/sessions/:sessionId', authenticate, csrfProtection, asyncHandler(authController.revokeSession));
