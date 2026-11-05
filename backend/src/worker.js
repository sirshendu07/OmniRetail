import { logger } from './common/utils/logger.js';
import { connectDatabase } from './database/connection.js';
import { connectRedis } from './infrastructure/redis/redis.client.js';
import { connectProducer } from './infrastructure/kafka/producer.js';
import { verifyKafkaConnectivity } from './infrastructure/kafka/admin.js';
import { closeInfrastructureConnections } from './infrastructure/shutdown.js';
import { startReservationWorker, stopReservationWorker } from './workers/reservation.worker.js';
import { startOutboxWorker, stopOutboxWorker } from './workers/outbox.worker.js';
import { startOrderSaga, stopOrderSaga } from './modules/sagas/orderSaga.orchestrator.js';

/**
 * Gracefully shuts down active background workers and network connections.
 */
async function gracefulWorkerShutdown(signal) {
  logger.info({ signal }, 'Worker process graceful shutdown initiated...');
  stopOutboxWorker();
  stopReservationWorker();
  await stopOrderSaga();

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
 * Boots background workers (Outbox, Reservation, Saga Orchestrator).
 */
async function startWorkers() {
  registerWorkerHandlers();
  try {
    logger.info('Initializing OmniRetail Background Worker Runtime...');
    await connectDatabase();
    await connectRedis();
    await verifyKafkaConnectivity();
    await connectProducer();

    startReservationWorker();
    startOutboxWorker();
    await startOrderSaga();

    logger.info('🚀 OmniRetail Background Workers & Saga Orchestrator active');
  } catch (err) {
    logger.fatal({ err }, 'Worker initialization failed');
    process.exit(1);
  }
}

startWorkers();
