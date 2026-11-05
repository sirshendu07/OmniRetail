import { Kafka, logLevel } from 'kafkajs';
import { kafkaConfig } from '../../config/kafka.config.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Maps KafkaJS log levels to Pino log levels.
 */
function toPinoLogLevel(level) {
  switch (level) {
    case logLevel.ERROR:
    case logLevel.NOTHING:
      return 'error';
    case logLevel.WARN:
      return 'warn';
    case logLevel.INFO:
      return 'info';
    case logLevel.DEBUG:
    default:
      return 'debug';
  }
}

/**
 * Custom KafkaJS log creator redirecting to our structured Pino logger.
 */
function pinoKafkaLogCreator() {
  return ({ level, log }) => {
    const { message, ...extra } = log;
    logger[toPinoLogLevel(level)]({ ...extra, component: 'kafkajs' }, message);
  };
}

export const kafka = new Kafka({
  clientId: kafkaConfig.clientId,
  brokers: kafkaConfig.brokers,
  connectionTimeout: kafkaConfig.connectionTimeout,
  requestTimeout: kafkaConfig.requestTimeout,
  retry: kafkaConfig.retry,
  logCreator: pinoKafkaLogCreator
});
