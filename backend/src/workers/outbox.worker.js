import { outboxRepository } from '../infrastructure/outbox/outbox.repository.js';
import { publishEvent } from '../infrastructure/kafka/producer.js';
import { KAFKA_TOPICS } from '../infrastructure/kafka/topics.js';
import { logger } from '../common/utils/logger.js';

let intervalTimer = null;
let isProcessing = false;

/**
 * Resolves target Kafka topic for domain event types.
 */
function resolveTopicForEvent(eventType) {
  if (['OrderCreated', 'OrderCancelled', 'OrderStatusUpdated'].includes(eventType)) {
    return KAFKA_TOPICS.ORDER_EVENTS;
  }
  if (['PaymentCaptured', 'PaymentFailed'].includes(eventType)) {
    return KAFKA_TOPICS.PAYMENT_EVENTS;
  }
  if (['InventoryReserved', 'InventoryReleased'].includes(eventType)) {
    return KAFKA_TOPICS.INVENTORY_EVENTS;
  }
  return KAFKA_TOPICS.ORDER_EVENTS;
}

/**
 * Sweeps pending outbox events and publishes them to Kafka broker.
 */
export async function processOutboxBatch() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const pendingEvents = await outboxRepository.findPending(50);
    if (pendingEvents.length === 0) return;

    for (const record of pendingEvents) {
      await publishSingleOutboxRecord(record);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Error during outbox batch processing');
  } finally {
    isProcessing = false;
  }
}

/**
 * Publishes individual outbox record and updates status based on broker ack.
 */
async function publishSingleOutboxRecord(record) {
  const topic = resolveTopicForEvent(record.eventType);
  const envelope = {
    eventId: record.eventId,
    eventType: record.eventType,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    payload: record.payload,
    timestamp: record.createdAt?.toISOString() || new Date().toISOString()
  };

  try {
    await publishEvent(topic, envelope, record.aggregateId);
    await outboxRepository.markPublished(record.eventId);
    logger.info({ eventId: record.eventId, topic }, 'Outbox event successfully published to Kafka');
  } catch (err) {
    await outboxRepository.markFailed(record.eventId, err.message);
    logger.error({ eventId: record.eventId, err: err.message }, 'Failed to publish outbox event to Kafka');
  }
}

/**
 * Starts background outbox publisher loop.
 * @param {number} [intervalMs=5000] - Polling interval in milliseconds
 */
export function startOutboxWorker(intervalMs = 5000) {
  logger.info({ intervalMs }, 'Starting Transactional Outbox Publisher Worker');
  intervalTimer = setInterval(processOutboxBatch, intervalMs);
}

/**
 * Gracefully stops the outbox publisher loop.
 */
export function stopOutboxWorker() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    logger.info('Transactional Outbox Publisher Worker stopped');
  }
}
