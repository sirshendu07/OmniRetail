process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';
import { connectProducer, disconnectProducer } from '../../src/infrastructure/kafka/producer.js';
import { verifyKafkaConnectivity, ensureTopicsExist, disconnectAdmin } from '../../src/infrastructure/kafka/admin.js';
import { KAFKA_TOPICS } from '../../src/infrastructure/kafka/topics.js';
import { Outbox, OUTBOX_STATUS } from '../../src/infrastructure/outbox/outbox.model.js';
import { processOutboxBatch } from '../../src/workers/outbox.worker.js';
import { handleSagaMessage, SAGA_CONSUMER_GROUP } from '../../src/modules/sagas/orderSaga.orchestrator.js';
import { inboxService } from '../../src/infrastructure/kafka/inbox.service.js';
import { Inbox } from '../../src/infrastructure/kafka/inbox.model.js';
import { Order, ORDER_STATUS } from '../../src/modules/orders/order.model.js';
import { Reservation, RESERVATION_STATUS } from '../../src/modules/reservations/reservation.model.js';
import { Inventory } from '../../src/modules/inventory/inventory.model.js';
import { Product } from '../../src/modules/catalog/product.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Location } from '../../src/modules/locations/location.model.js';

describe('Event-Driven Architecture & Order Saga Orchestration Tests', () => {
  let testCategory;
  let testProduct;
  let testLocation;
  const testUserId = new mongoose.Types.ObjectId();

  before(async () => {
    await connectDatabase();
    await connectRedis();
    await verifyKafkaConnectivity();
    await ensureTopicsExist([KAFKA_TOPICS.ORDER_EVENTS, KAFKA_TOPICS.PAYMENT_EVENTS]);
    await connectProducer();

    testCategory = await Category.create({
      name: 'Saga Cat',
      slug: `saga-cat-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Saga Test Item',
      sku: `SKU-SAGA-${Date.now()}`,
      description: 'Item for saga tests',
      brand: 'SagaBrand',
      category: testCategory._id,
      regularPrice: 2000
    });

    testLocation = await Location.create({
      code: `LOC-SAGA-${Date.now()}`,
      name: 'Saga Fulfillment Hub',
      type: 'WAREHOUSE',
      address: {
        street: '1 Hub Way',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'USA'
      },
      geo: {
        type: 'Point',
        coordinates: [-87.629, 41.878]
      }
    });

    await Inventory.create({
      productId: testProduct._id,
      locationId: testLocation._id,
      onHandStock: 10,
      availableStock: 9,
      reservedStock: 1
    });
  });

  after(async () => {
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      await Inventory.deleteMany({ productId: testProduct._id });
      await Reservation.deleteMany({ 'items.productId': testProduct._id });
      await Order.deleteMany({ userId: testUserId });
      await Outbox.deleteMany({ 'payload.userId': testUserId });
      await Inbox.deleteMany({ consumerGroup: SAGA_CONSUMER_GROUP });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testLocation) await Location.deleteOne({ _id: testLocation._id });
    await disconnectProducer();
    await disconnectAdmin();
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('Outbox Publisher sweeps pending events and transitions status to PUBLISHED', async () => {
    const testEventId = crypto.randomUUID();
    const testOrderId = `ORD-${Date.now()}-OUTBOX`;

    // 1. Seed pending outbox record
    await Outbox.create({
      eventId: testEventId,
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: testOrderId,
      payload: { orderId: testOrderId, userId: testUserId, amount: 2000 },
      status: OUTBOX_STATUS.PENDING
    });

    // 2. Trigger Outbox worker batch run
    await processOutboxBatch();

    // 3. Verify record was published
    const updatedRecord = await Outbox.findOne({ eventId: testEventId }).lean();
    assert.equal(updatedRecord.status, OUTBOX_STATUS.PUBLISHED);
    assert.ok(updatedRecord.publishedAt, 'publishedAt must be populated');
  });

  it('Saga Orchestrator transitions CONFIRMED order to ALLOCATED upon PaymentCaptured and records Inbox', async () => {
    const sagaOrderId = `ORD-${Date.now()}-SAGAPAY`;
    const eventId = crypto.randomUUID();

    // 1. Create order in CONFIRMED state
    await Order.create({
      orderId: sagaOrderId,
      userId: testUserId,
      idempotencyKey: `idemp-saga-${Date.now()}`,
      items: [{ productId: testProduct._id, sku: 'TEST', name: 'TEST', quantity: 1, unitPrice: 2000, lineTotal: 2000, locationId: testLocation._id }],
      fulfillmentType: 'SHIP_TO_HOME',
      fulfillmentLocationId: testLocation._id,
      shippingAddress: { street: '1', city: 'A', state: 'B', postalCode: 'C', country: 'D' },
      pricing: { subtotal: 2000, discount: 0, tax: 100, shippingFee: 0, grandTotal: 2100 },
      status: ORDER_STATUS.CONFIRMED
    });

    // 2. Dispatch PaymentCaptured message to Saga handler
    const messageEnvelope = {
      eventId,
      eventType: 'PaymentCaptured',
      aggregateType: 'Payment',
      aggregateId: sagaOrderId,
      payload: { orderId: sagaOrderId, amount: 2100 }
    };

    await handleSagaMessage({
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      message: { value: Buffer.from(JSON.stringify(messageEnvelope)) }
    });

    // 3. Verify Order transitioned to ALLOCATED
    const updatedOrder = await Order.findOne({ orderId: sagaOrderId });
    assert.equal(updatedOrder.status, ORDER_STATUS.ALLOCATED);

    // 4. Verify message recorded in Inbox (deduplication table)
    const isInboxRecorded = await inboxService.isProcessed(eventId, SAGA_CONSUMER_GROUP);
    assert.equal(isInboxRecorded, true, 'Event must be recorded in Inbox table');

    // 5. Replay identical message — verify idempotency
    await handleSagaMessage({
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      message: { value: Buffer.from(JSON.stringify(messageEnvelope)) }
    });
    const orderAfterReplay = await Order.findOne({ orderId: sagaOrderId });
    assert.equal(orderAfterReplay.status, ORDER_STATUS.ALLOCATED);
  });

  it('Saga Orchestrator executes compensation on PaymentFailed by releasing inventory', async () => {
    const failOrderId = `ORD-${Date.now()}-SAGAFAIL`;
    const failEventId = crypto.randomUUID();

    const reservation = await Reservation.create({
      reservationId: crypto.randomUUID(),
      userId: testUserId,
      items: [{ productId: testProduct._id, locationId: testLocation._id, quantity: 1 }],
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 600000)
    });

    await Order.create({
      orderId: failOrderId,
      userId: testUserId,
      idempotencyKey: `idemp-sagafail-${Date.now()}`,
      items: [{ productId: testProduct._id, sku: 'TEST', name: 'TEST', quantity: 1, unitPrice: 2000, lineTotal: 2000, locationId: testLocation._id }],
      fulfillmentType: 'SHIP_TO_HOME',
      fulfillmentLocationId: testLocation._id,
      shippingAddress: { street: '1', city: 'A', state: 'B', postalCode: 'C', country: 'D' },
      pricing: { subtotal: 2000, discount: 0, tax: 100, shippingFee: 0, grandTotal: 2100 },
      status: ORDER_STATUS.PENDING_PAYMENT,
      reservationId: reservation.reservationId
    });

    const failEnvelope = {
      eventId: failEventId,
      eventType: 'PaymentFailed',
      aggregateType: 'Payment',
      aggregateId: failOrderId,
      payload: { orderId: failOrderId, reason: 'Insufficient customer funds' }
    };

    await handleSagaMessage({
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      message: { value: Buffer.from(JSON.stringify(failEnvelope)) }
    });

    const failedOrder = await Order.findOne({ orderId: failOrderId });
    assert.equal(failedOrder.status, ORDER_STATUS.PAYMENT_FAILED);

    const releasedReservation = await Reservation.findOne({ reservationId: reservation.reservationId });
    assert.equal(releasedReservation.status, RESERVATION_STATUS.CANCELLED);
  });
});
