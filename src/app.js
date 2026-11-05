import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.config.js';
import { requestLogger } from './common/middleware/requestLogger.js';
import { errorHandler } from './common/middleware/errorHandler.js';
import { AppError } from './common/errors/AppError.js';
import { ERROR_CODES } from './common/errors/errorCodes.js';
import { isDatabaseHealthy } from './database/connection.js';
import { isRedisHealthy } from './infrastructure/redis/redis.client.js';
import { isKafkaProducerHealthy } from './infrastructure/kafka/producer.js';
import { sendSuccess } from './common/utils/responseHandler.js';
import { asyncHandler } from './common/utils/asyncHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';

export const app = express();

/**
 * Configure global security headers and CORS.
 */
function applySecurityMiddleware(appInstance) {
  appInstance.use(helmet());
  appInstance.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID', 'X-CSRF-Token']
    })
  );
}

/**
 * Configure request body parsers.
 * Preserves raw body for Razorpay webhook verification before JSON parsing.
 */
function applyBodyParsers(appInstance) {
  appInstance.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf; // Captured for webhook cryptographic signature verification
      }
    })
  );
  appInstance.use(express.urlencoded({ extended: true, limit: '2mb' }));
  appInstance.use(cookieParser());
}

/**
 * Mounts Kubernetes/Docker health and readiness probe endpoints.
 */
function mountHealthRoutes(appInstance) {
  appInstance.get('/health/live', (_req, res) => {
    return sendSuccess(res, 'OmniRetail service is alive', { status: 'UP', uptime: process.uptime() });
  });

  appInstance.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      const dbOk = isDatabaseHealthy();
      const redisOk = await isRedisHealthy();
      const kafkaOk = isKafkaProducerHealthy();

      const isReady = dbOk; // Primary DB must be up for readiness; Redis/Kafka warn if degraded
      const statusCode = isReady ? 200 : 503;

      return res.status(statusCode).json({
        success: isReady,
        message: isReady ? 'OmniRetail service is ready' : 'Service dependencies not ready',
        data: {
          database: dbOk ? 'UP' : 'DOWN',
          redis: redisOk ? 'UP' : 'DEGRADED',
          kafka: kafkaOk ? 'UP' : 'OFFLINE'
        }
      });
    })
  );
}

// 1. Core security and logging middleware
applySecurityMiddleware(app);
applyBodyParsers(app);
app.use(requestLogger);

// 2. Health routes
mountHealthRoutes(app);

// 3. API v1 Router Mount Point
const apiRouter = express.Router();
apiRouter.get('/', (_req, res) => {
  return sendSuccess(res, 'OmniRetail API v1 operational', { version: '1.0.0' });
});
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
app.use('/api/v1', apiRouter);

// 4. Catch-all for undefined routes
app.use((req, _res, next) => {
  next(new AppError(`Endpoint ${req.method} ${req.originalUrl} not found`, 404, ERROR_CODES.NOT_FOUND));
});

// 5. Centralized Error Handler
app.use(errorHandler);
