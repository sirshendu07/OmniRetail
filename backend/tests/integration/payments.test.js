process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';
import { User } from '../../src/modules/users/user.model.js';
import { Product } from '../../src/modules/catalog/product.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Location } from '../../src/modules/locations/location.model.js';
import { Inventory } from '../../src/modules/inventory/inventory.model.js';
import { Order, ORDER_STATUS } from '../../src/modules/orders/order.model.js';
import { Outbox } from '../../src/infrastructure/outbox/outbox.model.js';
import { Reservation, RESERVATION_STATUS } from '../../src/modules/reservations/reservation.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';
import { razorpayConfig } from '../../src/config/razorpay.config.js';

describe('Resilient Payment Integration Tests (Razorpay)', () => {
  let server = null;
  let baseUrl = '';
  let customerUser;
  let customerCookie = '';
  let testCategory;
  let testProduct;
  let testLocation;
  let testOrder;
  let testReservation;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    customerUser = await User.create({
      firstName: 'Bob',
      lastName: 'Payer',
      email: `bob.payer.${Date.now()}@walmart.com`,
      passwordHash: 'argon2id_mock_hash',
      role: ROLES.CUSTOMER,
      isEmailVerified: true
    });

    const sessionId = `pay-sess-${Date.now()}`;
    await Session.create({
      userId: customerUser._id,
      sessionId,
      hashedRefreshToken: 'pay-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const token = generateAccessToken({
      userId: customerUser._id,
      role: customerUser.role,
      sessionId
    });
    customerCookie = `accessToken=${token}`;

    testCategory = await Category.create({
      name: 'Payment Cat',
      slug: `pay-cat-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Samsung 4K Monitor',
      sku: `SKU-MONITOR-${Date.now()}`,
      description: '32-inch 4K UHD Smart Monitor',
      brand: 'Samsung',
      category: testCategory._id,
      regularPrice: 35000
    });

    testLocation = await Location.create({
      code: `LOC-PAY-${Date.now()}`,
      name: 'Walmart Center #300',
      type: 'STORE',
      address: {
        street: '100 Tech Way',
        city: 'Houston',
        state: 'TX',
        postalCode: '77001',
        country: 'USA'
      },
      geo: {
        type: 'Point',
        coordinates: [-95.369, 29.760]
      }
    });

    await Inventory.create({
      productId: testProduct._id,
      locationId: testLocation._id,
      onHandStock: 10,
      availableStock: 9,
      reservedStock: 1
    });

    testReservation = await Reservation.create({
      reservationId: crypto.randomUUID(),
      userId: customerUser._id,
      items: [{ productId: testProduct._id, locationId: testLocation._id, quantity: 1 }],
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 900000)
    });

    testOrder = await Order.create({
      orderId: `ORD-${Date.now()}-TESTPAY`,
      userId: customerUser._id,
      idempotencyKey: `idemp-pay-${Date.now()}`,
      items: [
        {
          productId: testProduct._id,
          sku: testProduct.sku,
          name: testProduct.name,
          quantity: 1,
          unitPrice: 35000,
          lineTotal: 35000,
          locationId: testLocation._id
        }
      ],
      fulfillmentType: 'SHIP_TO_HOME',
      fulfillmentLocationId: testLocation._id,
      shippingAddress: {
        street: '100 Tech Way',
        city: 'Houston',
        state: 'TX',
        postalCode: '77001',
        country: 'USA'
      },
      pricing: {
        subtotal: 35000,
        discount: 0,
        tax: 1750,
        shippingFee: 0,
        grandTotal: 36750
      },
      status: ORDER_STATUS.PENDING_PAYMENT,
      reservationId: testReservation.reservationId
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (customerUser) await User.deleteOne({ _id: customerUser._id });
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      await Inventory.deleteMany({ productId: testProduct._id });
      await Reservation.deleteMany({ 'items.productId': testProduct._id });
      await Order.deleteMany({ userId: customerUser._id });
      await Outbox.deleteMany({ 'payload.orderId': testOrder.orderId });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testLocation) await Location.deleteOne({ _id: testLocation._id });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('POST /api/v1/payments/create-order generates gateway order with correct amount in paise', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({ orderId: testOrder.orderId })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.razorpayOrderId);
    assert.equal(body.data.amount, 3675000); // 36750 * 100 paise
    assert.equal(body.data.currency, 'INR');
  });

  it('rejects tampered or forged payment signatures with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        orderId: testOrder.orderId,
        razorpayOrderId: 'order_test_fake',
        razorpayPaymentId: 'pay_test_fake',
        razorpaySignature: 'forged_invalid_signature_1234567890'
      })
    });

    assert.equal(res.status, 400);
  });

  it('confirms order and captures payment on cryptographically valid signature', async () => {
    const rzpOrderId = `order_test_${Date.now()}`;
    const rzpPaymentId = `pay_test_${Date.now()}`;

    // Compute genuine HMAC signature using configured secret
    const signature = crypto
      .createHmac('sha256', razorpayConfig.keySecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest('hex');

    const res = await fetch(`${baseUrl}/api/v1/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        orderId: testOrder.orderId,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: signature
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    // Verify order confirmed in database
    const confirmedOrder = await Order.findOne({ orderId: testOrder.orderId });
    assert.equal(confirmedOrder.status, ORDER_STATUS.CONFIRMED);
    assert.equal(confirmedOrder.payment.razorpayPaymentId, rzpPaymentId);

    // Verify stock deducted permanently (onHand 10 -> 9, reserved 1 -> 0)
    const stock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();
    assert.equal(stock.onHandStock, 9);
    assert.equal(stock.reservedStock, 0);

    // Verify Outbox recorded PaymentCaptured
    const outbox = await Outbox.findOne({
      eventType: 'PaymentCaptured',
      aggregateId: testOrder.orderId
    });
    assert.ok(outbox, 'Outbox must contain PaymentCaptured event');
  });

  it('handles payment.failed webhook event by marking order failed and releasing stock', async () => {
    const failedOrderId = `ORD-${Date.now()}-FAILTEST`;
    const failedReservation = await Reservation.create({
      reservationId: crypto.randomUUID(),
      userId: customerUser._id,
      items: [{ productId: testProduct._id, locationId: testLocation._id, quantity: 1 }],
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 900000)
    });

    await Order.create({
      orderId: failedOrderId,
      userId: customerUser._id,
      idempotencyKey: `idemp-fail-${Date.now()}`,
      items: [{ productId: testProduct._id, sku: 'TEST', name: 'TEST', quantity: 1, unitPrice: 100, lineTotal: 100, locationId: testLocation._id }],
      fulfillmentType: 'SHIP_TO_HOME',
      fulfillmentLocationId: testLocation._id,
      shippingAddress: { street: '1', city: 'A', state: 'B', postalCode: 'C', country: 'D' },
      pricing: { subtotal: 100, discount: 0, tax: 5, shippingFee: 0, grandTotal: 105 },
      status: ORDER_STATUS.PENDING_PAYMENT,
      reservationId: failedReservation.reservationId
    });

    // Artificially reserve 1 unit
    await Inventory.updateOne(
      { productId: testProduct._id, locationId: testLocation._id },
      { $inc: { availableStock: -1, reservedStock: 1 } }
    );

    const webhookPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_123',
            receipt: failedOrderId,
            error_description: 'Card declined by issuing bank'
          }
        }
      }
    };

    const res = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': 'test_mock_signature'
      },
      body: JSON.stringify(webhookPayload)
    });

    assert.equal(res.status, 200);

    const updatedFailedOrder = await Order.findOne({ orderId: failedOrderId });
    assert.equal(updatedFailedOrder.status, ORDER_STATUS.PAYMENT_FAILED);

    const releasedStock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();
    assert.equal(releasedStock.availableStock, 9);
    assert.equal(releasedStock.reservedStock, 0);

    const failOutbox = await Outbox.findOne({
      eventType: 'PaymentFailed',
      aggregateId: failedOrderId
    });
    assert.ok(failOutbox, 'Outbox must record PaymentFailed event');
  });
});
