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
import { productRouter } from './modules/catalog/product.routes.js';
import { categoryRouter } from './modules/categories/category.routes.js';
import { pricingRouter } from './modules/pricing/pricing.routes.js';
import { locationRouter } from './modules/locations/location.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { orderRouter } from './modules/orders/order.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { fulfillmentRouter } from './modules/fulfillment/fulfillment.routes.js';
import { transferRouter } from './modules/transfers/transfer.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';

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
apiRouter.use('/products', productRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/pricing', pricingRouter);
apiRouter.use('/locations', locationRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/fulfillment', fulfillmentRouter);
apiRouter.use('/transfers', transferRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/ai', aiRouter);
app.use('/api/v1', apiRouter);

// 4. Catch-all for undefined routes
app.use((req, _res, next) => {
  next(new AppError(`Endpoint ${req.method} ${req.originalUrl} not found`, 404, ERROR_CODES.NOT_FOUND));
});

// 5. Centralized Error Handler
app.use(errorHandler);
