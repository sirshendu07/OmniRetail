import { env } from './env.config.js';

export const razorpayConfig = Object.freeze({
  keyId: env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  keySecret: env.RAZORPAY_KEY_SECRET || 'secret_placeholder',
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || 'webhook_secret_placeholder',
  currency: 'INR'
});
