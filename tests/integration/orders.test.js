process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';
import { User } from '../../src/modules/users/user.model.js';
import { Product } from '../../src/modules/catalog/product.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Location } from '../../src/modules/locations/location.model.js';
import { Inventory } from '../../src/modules/inventory/inventory.model.js';
import { Cart } from '../../src/modules/cart/cart.model.js';
import { Order, ORDER_STATUS } from '../../src/modules/orders/order.model.js';
import { Outbox } from '../../src/infrastructure/outbox/outbox.model.js';
import { Reservation } from '../../src/modules/reservations/reservation.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';

describe('Cart & Order Management with Transactional Outbox Tests', () => {
  let server = null;
  let baseUrl = '';
  let customerUser;
  let customerCookie = '';
  let testCategory;
  let testProduct;
  let testLocation;
  let createdOrder;
  const testIdempotencyKey = `idemp-${Date.now()}`;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    customerUser = await User.create({
      firstName: 'Alice',
      lastName: 'Shopper',
      email: `alice.shopper.${Date.now()}@walmart.com`,
      passwordHash: 'argon2id_mock_hash',
      role: ROLES.CUSTOMER,
      isEmailVerified: true
    });

    const sessionId = `cust-sess-${Date.now()}`;
    await Session.create({
      userId: customerUser._id,
      sessionId,
      hashedRefreshToken: 'cust-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const token = generateAccessToken({
      userId: customerUser._id,
      role: customerUser.role,
      sessionId
    });
    customerCookie = `accessToken=${token}`;

    testCategory = await Category.create({
      name: 'Order Test Cat',
      slug: `ord-cat-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Sony WH-1000XM5 Headphones',
      sku: `SKU-HEADPHONE-${Date.now()}`,
      description: 'Noise Cancelling Headphones',
      brand: 'Sony',
      category: testCategory._id,
      regularPrice: 29999,
      salePrice: 26999
    });

    testLocation = await Location.create({
      code: `LOC-ORD-${Date.now()}`,
      name: 'Walmart Store #200',
      type: 'STORE',
      address: {
        street: '400 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '73301',
        country: 'USA'
      },
      geo: {
        type: 'Point',
        coordinates: [-97.743, 30.267]
      }
    });

    // Initialize 20 units of stock
    await Inventory.create({
      productId: testProduct._id,
      locationId: testLocation._id,
      onHandStock: 20,
      availableStock: 20,
      reservedStock: 0
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
      await Cart.deleteOne({ userId: customerUser._id });
      await Outbox.deleteMany({ 'payload.userId': customerUser._id });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testLocation) await Location.deleteOne({ _id: testLocation._id });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('POST /api/v1/cart/items adds product to user cart and recalculates live prices', async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        productId: testProduct._id.toString(),
        quantity: 2
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.items.length, 1);
    assert.equal(body.data.items[0].currentUnitPrice, 26999);
    assert.equal(body.data.items[0].lineTotal, 53998);
  });

  it('POST /api/v1/orders/checkout creates order atomically with reservation & outbox record', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        idempotencyKey: testIdempotencyKey,
        fulfillmentType: 'SHIP_TO_HOME',
        fulfillmentLocationId: testLocation._id.toString(),
        shippingAddress: {
          street: '55 Congress Ave',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'USA'
        }
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    createdOrder = body.data;

    assert.equal(createdOrder.status, ORDER_STATUS.PENDING_PAYMENT);
    assert.equal(createdOrder.items.length, 1);
    assert.equal(createdOrder.items[0].quantity, 2);
    assert.ok(createdOrder.reservationId, 'Order must have linked reservationId');

    // Verify inventory reserved atomically
    const stock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();
    assert.equal(stock.availableStock, 18);
    assert.equal(stock.reservedStock, 2);

    // Verify Transactional Outbox record exists
    const outboxEvent = await Outbox.findOne({
      eventType: 'OrderCreated',
      aggregateId: createdOrder.orderId
    }).lean();
    assert.ok(outboxEvent, 'Outbox must contain OrderCreated event persisted in same transaction');
    assert.equal(outboxEvent.status, 'PENDING');
    assert.equal(outboxEvent.payload.orderId, createdOrder.orderId);

    // Verify cart was cleared
    const cartRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: { Cookie: customerCookie }
    });
    const cartBody = await cartRes.json();
    assert.equal(cartBody.data.items.length, 0, 'Cart should be empty after checkout');
  });

  it('idempotent checkout submission with duplicate idempotencyKey returns existing order safely', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        idempotencyKey: testIdempotencyKey,
        fulfillmentType: 'SHIP_TO_HOME',
        fulfillmentLocationId: testLocation._id.toString(),
        shippingAddress: {
          street: '55 Congress Ave',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'USA'
        }
      })
    });

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.orderId, createdOrder.orderId, 'Must return identical order without duplicate charge');
  });

  it('POST /api/v1/orders/:orderId/cancel cancels order and releases reserved inventory', async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/${createdOrder.orderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        reason: 'Customer changed mind'
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, ORDER_STATUS.CANCELLED);

    // Verify reserved stock was returned to available pool
    const restoredStock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();
    assert.equal(restoredStock.availableStock, 20);
    assert.equal(restoredStock.reservedStock, 0);

    // Verify Outbox recorded OrderCancelled event
    const cancelOutbox = await Outbox.findOne({
      eventType: 'OrderCancelled',
      aggregateId: createdOrder.orderId
    }).lean();
    assert.ok(cancelOutbox, 'Outbox must record OrderCancelled event');
  });
});
