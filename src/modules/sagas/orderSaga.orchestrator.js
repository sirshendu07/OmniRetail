import { createConsumer, disconnectConsumer } from '../../infrastructure/kafka/consumer.js';
import { inboxService } from '../../infrastructure/kafka/inbox.service.js';
import { dlqService } from '../../infrastructure/kafka/dlq.service.js';
import { orderRepository } from '../orders/order.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { KAFKA_TOPICS } from '../../infrastructure/kafka/topics.js';
import { ORDER_STATUS } from '../orders/order.model.js';
import { logger } from '../../common/utils/logger.js';

export const SAGA_CONSUMER_GROUP = 'order-saga-orchestrator-group';
let sagaConsumerInstance = null;

/**
 * Handles incoming Kafka events for the Order Saga with deduplication and DLQ fallback.
 */
export async function handleSagaMessage({ topic, message }) {
  const rawValue = message.value?.toString();
  if (!rawValue) return;

  let envelope;
  try {
    envelope = JSON.parse(rawValue);
  } catch (err) {
    await dlqService.sendToDeadLetterQueue(topic, { raw: rawValue }, err, SAGA_CONSUMER_GROUP);
    return;
  }

  const isDuplicate = await inboxService.isProcessed(envelope.eventId, SAGA_CONSUMER_GROUP);
  if (isDuplicate) {
    logger.debug({ eventId: envelope.eventId }, 'Saga event already processed. Skipping');
    return;
  }

  try {
    await executeSagaTransition(envelope);
    await inboxService.recordProcessed(envelope.eventId, SAGA_CONSUMER_GROUP, topic);
  } catch (err) {
    await dlqService.sendToDeadLetterQueue(topic, envelope, err, SAGA_CONSUMER_GROUP);
  }
}

/**
 * Routes domain events to appropriate saga transition handlers.
 */
async function executeSagaTransition(envelope) {
  switch (envelope.eventType) {
    case 'PaymentCaptured':
      await handlePaymentCaptured(envelope.payload);
      break;
    case 'PaymentFailed':
      await handlePaymentFailed(envelope.payload);
      break;
    default:
      break;
  }
}

/**
 * Handles successful payment: transitions order to ALLOCATED for store / warehouse fulfillment.
 */
async function handlePaymentCaptured(payload) {
  const order = await orderRepository.findByOrderId(payload.orderId);
  if (!order) return;

  if (order.status === ORDER_STATUS.CONFIRMED) {
    await orderRepository.updateStatus(order.orderId, ORDER_STATUS.ALLOCATED);
    logger.info({ orderId: order.orderId }, 'SAGA: Order transitioned to ALLOCATED for fulfillment');
  }
}

/**
 * Executes compensation logic on payment failure: releases inventory reservation & updates status.
 */
async function handlePaymentFailed(payload) {
  const order = await orderRepository.findByOrderId(payload.orderId);
  if (!order || order.status === ORDER_STATUS.CANCELLED) return;

  if (order.reservationId) {
    await inventoryService.releaseReservation(order.reservationId);
    logger.info({ orderId: order.orderId }, 'SAGA COMPENSATION: Released reserved inventory stock');
  }
  await orderRepository.updateStatus(order.orderId, ORDER_STATUS.PAYMENT_FAILED, {
    cancellationReason: payload.reason || 'Payment failed during checkout'
  });
  logger.info({ orderId: order.orderId }, 'SAGA: Order marked PAYMENT_FAILED after compensation');
}

/**
 * Boots the Order Saga Kafka consumer.
 */
export async function startOrderSaga() {
  sagaConsumerInstance = await createConsumer({
    groupId: SAGA_CONSUMER_GROUP,
    topics: [KAFKA_TOPICS.PAYMENT_EVENTS, KAFKA_TOPICS.ORDER_EVENTS],
    fromBeginning: false,
    eachMessage: handleSagaMessage
  });
  logger.info('Order Saga Orchestrator consumer started successfully');
  return sagaConsumerInstance;
}

/**
 * Stops the Order Saga Kafka consumer cleanly.
 */
export async function stopOrderSaga() {
  if (sagaConsumerInstance) {
    await disconnectConsumer(sagaConsumerInstance);
    sagaConsumerInstance = null;
    logger.info('Order Saga Orchestrator stopped cleanly');
  }
}
