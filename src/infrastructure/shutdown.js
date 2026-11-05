import { logger } from '../common/utils/logger.js';
import { disconnectDatabase } from '../database/connection.js';
import { disconnectRedis } from './redis/redis.client.js';
import { disconnectProducer } from './kafka/producer.js';
import { disconnectAllConsumers } from './kafka/consumer.js';
import { disconnectAdmin } from './kafka/admin.js';

/**
 * Closes all persistent infrastructure network connections (Kafka, Redis, MongoDB)
 * in safe reverse-dependency order.
 * @returns {Promise<void>}
 */
export async function closeInfrastructureConnections() {
  logger.info('Commencing infrastructure teardown...');
  // 1. Terminate Kafka consumers and producer
  await disconnectAllConsumers();
  await disconnectProducer();
  await disconnectAdmin();

  // 2. Terminate Redis client connection
  await disconnectRedis();

  // 3. Terminate MongoDB connection pool
  await disconnectDatabase();

  logger.info('All infrastructure connections closed successfully');
}
