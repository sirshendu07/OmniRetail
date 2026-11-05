import { app } from './app.js';
import { env } from './config/env.config.js';
import { logger } from './common/utils/logger.js';
import { connectDatabase } from './database/connection.js';
import { connectRedis } from './infrastructure/redis/redis.client.js';
import { connectProducer } from './infrastructure/kafka/producer.js';
import { closeInfrastructureConnections } from './infrastructure/shutdown.js';

let server = null;

/**
 * Shuts down all active network listeners and infrastructure connections.
 * @param {string} signal - Triggering termination signal or event
 */
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Graceful shutdown initiated. Closing active connections...');
  if (server) {
    server.close(() => {
      logger.info('HTTP server stopped accepting new connections');
    });
  }

  try {
    await closeInfrastructureConnections();
    logger.info('Exiting process safely.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown sequence');
    process.exit(1);
  }
}

/**
 * Registers OS signal listeners and global process exception handlers.
 */
function registerProcessHandlers() {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception detected in process');
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection detected');
    gracefulShutdown('unhandledRejection');
  });
}

/**
 * Boots dependencies and starts HTTP server listener.
 */
async function startServer() {
  registerProcessHandlers();
  try {
    logger.info('Connecting to MongoDB Atlas...');
    await connectDatabase();

    logger.info('Connecting to Redis cluster...');
    await connectRedis();

    logger.info('Connecting to Kafka broker...');
    await connectProducer();

    server = app.listen(env.PORT, () => {
      logger.info(`🚀 OmniRetail API Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap OmniRetail application');
    process.exit(1);
  }
}

startServer();
