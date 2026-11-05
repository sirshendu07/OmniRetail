import crypto from 'node:crypto';

/**
 * Creates a standard event envelope for event-driven messaging across Kafka topics.
 * 
 * @param {Object} params
 * @param {string} params.eventType - e.g. 'OrderCreated', 'InventoryReserved'
 * @param {string} [params.aggregateType='Order'] - e.g. 'Order', 'Inventory'
 * @param {string} params.aggregateId - e.g. orderId, productId
 * @param {Object} params.payload - Domain payload data
 * @param {string} [params.correlationId] - Distributed tracing correlation ID
 * @param {string} [params.causationId] - ID of event that caused this event
 * @param {number} [params.version=1] - Version for schema evolution
 * @returns {Object} Standardized event envelope
 */
export function createEventEnvelope({
  eventType,
  aggregateType = 'Order',
  aggregateId,
  payload,
  correlationId = crypto.randomUUID(),
  causationId = null,
  version = 1
}) {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    aggregateType,
    aggregateId: String(aggregateId),
    payload,
    timestamp: new Date().toISOString(),
    version,
    correlationId,
    causationId
  };
}
