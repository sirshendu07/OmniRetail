import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import {
  createPaymentOrderSchema,
  verifyPaymentSignatureSchema
} from './payment.validator.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const paymentRouter = Router();

// Inbound webhook from Razorpay (public endpoint verified via raw body HMAC)
paymentRouter.post('/webhook', asyncHandler(paymentController.handleWebhook));

// Authenticated client payment initiation and verification
paymentRouter.use(authenticate);

paymentRouter.post(
  '/create-order',
  csrfProtection,
  validateRequest(createPaymentOrderSchema),
  asyncHandler(paymentController.createPaymentOrder)
);

paymentRouter.post(
  '/verify',
  csrfProtection,
  validateRequest(verifyPaymentSignatureSchema),
  asyncHandler(paymentController.verifySignature)
);
