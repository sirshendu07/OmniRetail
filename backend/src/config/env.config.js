import 'dotenv/config';
import { z } from 'zod';
import { logger } from '../common/utils/logger.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Databases & Caching
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Event Streaming
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('omni-retail-service'),
  KAFKA_GROUP_ID: z.string().default('omni-retail-consumer-group'),

  // Cryptographic Secrets
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  OTP_HMAC_SECRET: z.string().min(32, 'OTP_HMAC_SECRET must be at least 32 characters'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),

  // Email (Gmail SMTP)
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().default(587),
  EMAIL_SECURE: z.coerce.boolean().default(false),
  EMAIL_USER: z.string().email().optional(),
  EMAIL_APP_PASSWORD: z.string().optional(),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Gemini AI
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Qdrant
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional()
});

/**
 * Validates process.env variables against envSchema.
 * Throws a formatted error and exits if environment fails validation.
 * @returns {z.infer<typeof envSchema>}
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formattedErrors = result.error.format();
    logger.fatal({ errors: formattedErrors }, '❌ Invalid environment configuration. Terminating process.');
    throw new Error('Environment configuration validation failed');
  }
  return result.data;
}

export const env = validateEnv();
