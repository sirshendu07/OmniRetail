import pino from 'pino';

/**
 * Sensitive fields to automatically redact from all structured logs.
 * Prevents accidental credential, token, or PII leakage into log sinks.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  'confirmPassword',
  '*.confirmPassword',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'otp',
  '*.otp',
  'secret',
  '*.secret',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'cardNumber',
  '*.cardNumber',
  'cvv',
  '*.cvv'
];

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Application-wide Pino logger instance.
 * Uses pino-pretty formatting in development and raw JSON in production for ELK/CloudWatch ingestion.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]'
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});
