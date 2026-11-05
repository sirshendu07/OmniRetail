import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectProducer, publishEvent, disconnectProducer } from '../../src/infrastructure/kafka/producer.js';
import { createConsumer, disconnectConsumer } from '../../src/infrastructure/kafka/consumer.js';
import { verifyKafkaConnectivity, ensureTopicsExist, disconnectAdmin } from '../../src/infrastructure/kafka/admin.js';
import { createEventEnvelope } from '../../src/infrastructure/kafka/eventEnvelope.js';
import { KAFKA_TOPICS } from '../../src/infrastructure/kafka/topics.js';

describe('Kafka End-to-End Integration Tests', () => {
  let testConsumer = null;

  before(async () => {
    const isConnected = await verifyKafkaConnectivity();
    assert.equal(isConnected, true, 'Kafka broker must be reachable on localhost:9092');
    await ensureTopicsExist([KAFKA_TOPICS.ORDER_EVENTS]);
    await connectProducer();
  });

  after(async () => {
    if (testConsumer) {
      await disconnectConsumer(testConsumer);
    }
    await disconnectProducer();
    await disconnectAdmin();
  });

  it('should publish an OrderCreated event to order-events and consume it successfully', async () => {
    const testOrderId = `order-${Date.now()}`;
    const testEnvelope = createEventEnvelope({
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: testOrderId,
      payload: {
        orderId: testOrderId,
        customerId: 'cust-9988',
        grandTotal: 4999,
        items: [{ sku: 'TEST-SKU-1', quantity: 2, unitPrice: 2499.5 }]
      }
    });

    let messageHandler;
    const messagePromise = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 15000);
      messageHandler = (envelope) => {
        if (envelope?.aggregateId === testOrderId) {
          clearTimeout(timeout);
          resolve(envelope);
        }
      };
    });

    testConsumer = await createConsumer({
      groupId: `test-group-${Date.now()}`,
      topics: [KAFKA_TOPICS.ORDER_EVENTS],
      fromBeginning: false,
      eachMessage: async ({ message }) => {
        const parsed = JSON.parse(message.value.toString());
        if (messageHandler) {
          messageHandler(parsed);
        }
      }
    });

    // Wait 2.5s for consumer partition rebalancing to settle
    await new Promise((r) => setTimeout(r, 2500));

    await publishEvent(KAFKA_TOPICS.ORDER_EVENTS, testEnvelope, testOrderId);

    const receivedMessage = await messagePromise;
    assert.ok(receivedMessage, 'Consumer should receive the published event within timeout');
    assert.equal(receivedMessage.eventId, testEnvelope.eventId);
    assert.equal(receivedMessage.eventType, 'OrderCreated');
    assert.equal(receivedMessage.aggregateType, 'Order');
    assert.equal(receivedMessage.aggregateId, testOrderId);
    assert.equal(receivedMessage.payload.grandTotal, 4999);
  });
});
