import { logger } from './common/utils/logger.js';
import { connectDatabase } from './database/connection.js';
import { closeInfrastructureConnections } from './infrastructure/shutdown.js';

let isRunning = true;

/**
 * Gracefully shuts down active background workers and DB connections.
 */
async function gracefulWorkerShutdown(signal) {
  logger.info({ signal }, 'Worker process graceful shutdown initiated...');
  isRunning = false;
  try {
    await closeInfrastructureConnections();
    logger.info('Worker connections terminated. Exiting process.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Worker shutdown error');
    process.exit(1);
  }
}

/**
 * Registers OS signal listeners for background worker runtime.
 */
function registerWorkerHandlers() {
  process.on('SIGTERM', () => gracefulWorkerShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulWorkerShutdown('SIGINT'));
}

/**
 * Boots background workers (Outbox, Reservation, Notification, Kafka Consumers).
 */
async function startWorkers() {
  registerWorkerHandlers();
  try {
    logger.info('Initializing OmniRetail Background Worker Runtime...');
    await connectDatabase();
    logger.info('Background Worker Runtime active and ready for jobs');
  } catch (err) {
    logger.fatal({ err }, 'Worker initialization failed');
    process.exit(1);
  }
}

startWorkers();
