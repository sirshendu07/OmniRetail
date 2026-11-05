import { Outbox, OUTBOX_STATUS } from './outbox.model.js';

export class OutboxRepository {
  /**
   * Persists an event envelope within the active business transaction.
   */
  async createEvent(eventData, session = null) {
    const [event] = await Outbox.create([eventData], { session });
    return event;
  }

  /**
   * Finds pending events for publisher worker batching.
   */
  async findPending(limit = 50) {
    return Outbox.find({ status: OUTBOX_STATUS.PENDING })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Marks outbox record as published with timestamp.
   */
  async markPublished(eventId) {
    return Outbox.updateOne(
      { eventId },
      { $set: { status: OUTBOX_STATUS.PUBLISHED, publishedAt: new Date() } }
    );
  }

  /**
   * Increments retry count or flags event as FAILED upon broker delivery errors.
   */
  async markFailed(eventId, errorMessage, maxRetries = 5) {
    return Outbox.updateOne(
      { eventId },
      [
        {
          $set: {
            retries: { $add: ['$retries', 1] },
            error: errorMessage,
            status: {
              $cond: {
                if: { $gte: [{ $add: ['$retries', 1] }, maxRetries] },
                then: OUTBOX_STATUS.FAILED,
                else: OUTBOX_STATUS.PENDING
              }
            }
          }
        }
      ]
    );
  }
}

export const outboxRepository = new OutboxRepository();
