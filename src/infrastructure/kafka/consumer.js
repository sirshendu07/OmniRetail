import { kafka } from './kafka.client.js';
import { logger } from '../../common/utils/logger.js';

const activeConsumers = new Set();

/**
 * Creates and starts a Kafka consumer for specified topics.
 * 
 * @param {Object} options
 * @param {string} options.groupId - Kafka consumer group identifier
 * @param {string[]} options.topics - Array of topic names to subscribe to
 * @param {Function} options.eachMessage - Message handler callback ({ topic, partition, message })
 * @param {boolean} [options.fromBeginning=false] - Whether to read from offset 0
 * @returns {Promise<import('kafkajs').Consumer>}
 */
export async function createConsumer({ groupId, topics, eachMessage, fromBeginning = false }) {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    rebalanceTimeout: 60000
  });

  registerConsumerCrashHandler(consumer, groupId);
  await consumer.connect();
  activeConsumers.add(consumer);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning });
  }

  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 5000,
    eachMessage: async (payload) => {
      try {
        await eachMessage(payload);
      } catch (err) {
        logger.error({ err: err.message, topic: payload.topic, partition: payload.partition }, 'Error processing Kafka message');
      }
    }
  });

  logger.info({ groupId, topics }, 'Kafka consumer subscribed and running');
  return consumer;
}

/**
 * Registers crash listener for automated diagnostic logging.
 * @param {import('kafkajs').Consumer} consumer
 * @param {string} groupId
 */
function registerConsumerCrashHandler(consumer, groupId) {
  consumer.on(consumer.events.CRASH, (event) => {
    logger.error({ groupId, error: event.payload.error?.message }, 'Kafka consumer group crashed. Auto-reconnect will trigger on next poll');
  });
}

/**
 * Disconnects a specific consumer and removes it from active tracking.
 * @param {import('kafkajs').Consumer} consumer
 */
export async function disconnectConsumer(consumer) {
  if (!consumer) return;
  try {
    await consumer.disconnect();
    activeConsumers.delete(consumer);
    logger.info('Kafka consumer disconnected gracefully');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to cleanly disconnect Kafka consumer');
  }
}

/**
 * Gracefully disconnects all active consumers during application shutdown.
 */
export async function disconnectAllConsumers() {
  for (const consumer of activeConsumers) {
    await disconnectConsumer(consumer);
  }
  activeConsumers.clear();
}
