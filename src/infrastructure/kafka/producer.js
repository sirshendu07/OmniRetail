import { kafka } from './kafka.client.js';
import { logger } from '../../common/utils/logger.js';

let producer = null;
let isConnected = false;

/**
 * Lazily gets or initializes the Kafka producer instance.
 * @returns {import('kafkajs').Producer}
 */
export function getKafkaProducer() {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });
  }
  return producer;
}

/**
 * Connects the Kafka producer to the broker cluster.
 * @returns {Promise<boolean>}
 */
export async function connectProducer() {
  try {
    const prod = getKafkaProducer();
    await prod.connect();
    isConnected = true;
    logger.info('Kafka producer connected successfully');
    return true;
  } catch (err) {
    isConnected = false;
    logger.warn({ err: err.message }, 'Kafka broker unavailable during producer connect');
    return false;
  }
}

/**
 * Publishes an event to a Kafka topic with optional partition key.
 * @param {string} topic 
 * @param {Object} message 
 * @param {string} [key] 
 */
export async function publishEvent(topic, message, key = null) {
  if (!isConnected) {
    logger.warn({ topic, key }, 'Kafka producer offline. Skipping direct message dispatch');
    return null;
  }
  const prod = getKafkaProducer();
  return prod.send({
    topic,
    messages: [{ key: key ? String(key) : null, value: JSON.stringify(message) }]
  });
}

/**
 * Disconnects the Kafka producer gracefully.
 */
export async function disconnectProducer() {
  if (producer && isConnected) {
    await producer.disconnect();
    isConnected = false;
    logger.info('Kafka producer disconnected gracefully');
  }
}

/**
 * Returns producer connection health.
 * @returns {boolean}
 */
export function isKafkaProducerHealthy() {
  return isConnected;
}
