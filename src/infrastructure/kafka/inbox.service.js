import { Inbox } from './inbox.model.js';
import { logger } from '../../common/utils/logger.js';

export class InboxService {
  /**
   * Checks if an event was already processed by this consumer group.
   * @param {string} messageId - The unique eventId from the event envelope
   * @param {string} consumerGroup - Consumer group identifier
   * @returns {Promise<boolean>}
   */
  async isProcessed(messageId, consumerGroup) {
    const existing = await Inbox.findOne({ messageId, consumerGroup }).lean();
    return Boolean(existing);
  }

  /**
   * Records event in the Inbox table to prevent duplicate replay processing.
   * @param {string} messageId
   * @param {string} consumerGroup
   * @param {string} topic
   */
  async recordProcessed(messageId, consumerGroup, topic) {
    try {
      await Inbox.create({ messageId, consumerGroup, topic });
      return true;
    } catch (err) {
      if (err.code === 11000) {
        logger.warn({ messageId, consumerGroup }, 'Duplicate message detected via Inbox unique constraint');
        return false;
      }
      throw err;
    }
  }
}

export const inboxService = new InboxService();
