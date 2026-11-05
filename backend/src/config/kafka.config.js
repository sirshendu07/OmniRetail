import { env } from './env.config.js';

/**
 * Splits comma-separated broker strings into an array of broker addresses.
 * @param {string} brokersString 
 * @returns {string[]}
 */
function parseBrokers(brokersString) {
  return brokersString.split(',').map((broker) => broker.trim()).filter(Boolean);
}

/**
 * KafkaJS Client and Broker Configuration
 */
export const kafkaConfig = Object.freeze({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: parseBrokers(env.KAFKA_BROKERS),
  groupId: env.KAFKA_GROUP_ID,
  connectionTimeout: 5000,
  requestTimeout: 25000,
  retry: {
    initialRetryTime: 300,
    retries: 8
  }
});
