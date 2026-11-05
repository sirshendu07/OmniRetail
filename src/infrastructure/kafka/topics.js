/**
 * Kafka Topic Catalog for OmniRetail Event-Driven Architecture.
 */
export const KAFKA_TOPICS = Object.freeze({
  ORDER_EVENTS: 'order-events',
  INVENTORY_EVENTS: 'inventory-events',
  PAYMENT_EVENTS: 'payment-events',
  FULFILLMENT_EVENTS: 'fulfillment-events',
  SHIPMENT_EVENTS: 'shipment-events',
  NOTIFICATION_EVENTS: 'notification-events'
});
