import { publishEvent } from './producer.js';
import { logger } from '../../common/utils/logger.js';

export class DlqService {
  /**
   * Publishes unprocessable or poisoned messages to Dead Letter Queue for analysis.
   * 
   * @param {string} originalTopic
   * @param {Object} rawMessage
   * @param {Error} error
   * @param {string} consumerGroup
   */
  async sendToDeadLetterQueue(originalTopic, rawMessage, error, consumerGroup) {
    const dlqTopic = `${originalTopic}.DLQ`;
    const dlqPayload = {
      originalTopic,
      consumerGroup,
      failedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorStack: error.stack,
      payload: rawMessage
    };

    logger.error({ originalTopic, dlqTopic, err: error.message }, 'Routing poison pill message to Dead Letter Queue');
    try {
      await publishEvent(dlqTopic, dlqPayload, rawMessage?.aggregateId || null);
    } catch (err) {
      logger.fatal({ err: err.message, dlqTopic }, 'Failed to publish to Dead Letter Queue');
    }
  }
}

export const dlqService = new DlqService();
