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
import { Transfer } from '../../src/modules/transfers/transfer.model.js';
import { Order, ORDER_STATUS } from '../../src/modules/orders/order.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';

describe('Omnichannel Fulfillment & Real-Time Analytics Tests', () => {
  let server = null;
  let baseUrl = '';
  let adminUser;
  let adminCookie = '';
  let testCategory;
  let testProduct;
  let storeA;
  let storeB;
  let createdTransfer;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    adminUser = await User.create({
      firstName: 'Ops',
      lastName: 'Director',
      email: `ops.director.${Date.now()}@walmart.com`,
      passwordHash: 'argon2id_mock_hash',
      role: ROLES.ADMIN,
      isEmailVerified: true
    });

    const sessionId = `admin-ops-sess-${Date.now()}`;
    await Session.create({
      userId: adminUser._id,
      sessionId,
      hashedRefreshToken: 'ops-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const token = generateAccessToken({
      userId: adminUser._id,
      role: adminUser.role,
      sessionId
    });
    adminCookie = `accessToken=${token}`;

    testCategory = await Category.create({
      name: 'Omni Cat',
      slug: `omni-cat-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Smart Air Fryer',
      sku: `SKU-FRYER-${Date.now()}`,
      description: 'Digital Touchscreen Air Fryer',
      brand: 'Instant',
      category: testCategory._id,
      regularPrice: 7999
    });

    storeA = await Location.create({
      code: `LOC-ST-A-${Date.now()}`,
      name: 'Walmart Supercenter Dallas North',
      type: 'STORE',
      address: { street: '100 North St', city: 'Dallas', state: 'TX', postalCode: '75201', country: 'USA' },
      geo: { type: 'Point', coordinates: [-96.80, 32.78] }
    });

    storeB = await Location.create({
      code: `LOC-ST-B-${Date.now()}`,
      name: 'Walmart Supercenter Fort Worth',
      type: 'STORE',
      address: { street: '200 West St', city: 'Fort Worth', state: 'TX', postalCode: '76101', country: 'USA' },
      geo: { type: 'Point', coordinates: [-97.33, 32.75] }
    });

    // 25 units at Store A, 0 at Store B
    await Inventory.create({
      productId: testProduct._id,
      locationId: storeA._id,
      onHandStock: 25,
      availableStock: 25,
      reservedStock: 0
    });

    // Seed confirmed order for Analytics testing
    await Order.create({
      orderId: `ORD-${Date.now()}-ANALYTICS`,
      userId: adminUser._id,
      idempotencyKey: `idemp-analytics-${Date.now()}`,
      items: [{ productId: testProduct._id, sku: 'TEST', name: 'TEST', quantity: 2, unitPrice: 7999, lineTotal: 15998, locationId: storeA._id }],
      fulfillmentType: 'BOPIS',
      fulfillmentLocationId: storeA._id,
      shippingAddress: { street: '1', city: 'A', state: 'B', postalCode: 'C', country: 'D' },
      pricing: { subtotal: 15998, discount: 0, tax: 800, shippingFee: 0, grandTotal: 16798 },
      status: ORDER_STATUS.CONFIRMED
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
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      await Inventory.deleteMany({ productId: testProduct._id });
      await Transfer.deleteMany({ 'items.productId': testProduct._id });
      await Order.deleteMany({ userId: adminUser._id });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (storeA) await Location.deleteOne({ _id: storeA._id });
    if (storeB) await Location.deleteOne({ _id: storeB._id });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('POST /api/v1/fulfillment/source resolves nearest store with stock', async () => {
    const res = await fetch(`${baseUrl}/api/v1/fulfillment/source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lng: -96.79,
        lat: 32.77,
        items: [{ productId: testProduct._id.toString(), quantity: 2 }]
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.locationId, storeA._id.toString());
    assert.equal(body.data.strategy, 'SHIP_FROM_STORE');
  });

  it('POST /api/v1/fulfillment/stores/:id/bopis-check verifies Click & Collect eligibility', async () => {
    const res = await fetch(`${baseUrl}/api/v1/fulfillment/stores/${storeA._id}/bopis-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: testProduct._id.toString(), quantity: 5 }]
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.eligibleForBopis, true);
  });

  it('executes inter-store transfer lifecycle: REQUEST -> DISPATCH -> RECEIVE', async () => {
    // 1. Request transfer of 5 units from Store A to Store B
    const reqRes = await fetch(`${baseUrl}/api/v1/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        fromLocationId: storeA._id.toString(),
        toLocationId: storeB._id.toString(),
        items: [{ productId: testProduct._id.toString(), quantity: 5 }]
      })
    });

    const reqBody = await reqRes.json();
    assert.equal(reqRes.status, 201);
    createdTransfer = reqBody.data;
    assert.equal(createdTransfer.status, 'REQUESTED');

    // Verify Store A stock was placed on transfer hold (25 -> 20 available, 5 reserved)
    const storeAStock = await Inventory.findOne({ productId: testProduct._id, locationId: storeA._id }).lean();
    assert.equal(storeAStock.availableStock, 20);
    assert.equal(storeAStock.reservedStock, 5);

    // 2. Dispatch transfer
    const dispRes = await fetch(`${baseUrl}/api/v1/transfers/${createdTransfer.transferId}/dispatch`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'X-CSRF-Token': 'csrf-token' }
    });
    const dispBody = await dispRes.json();
    assert.equal(dispRes.status, 200);
    assert.equal(dispBody.data.status, 'IN_TRANSIT');

    // 3. Receive transfer at Store B
    const recvRes = await fetch(`${baseUrl}/api/v1/transfers/${createdTransfer.transferId}/receive`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'X-CSRF-Token': 'csrf-token' }
    });
    const recvBody = await recvRes.json();
    assert.equal(recvRes.status, 200);
    assert.equal(recvBody.data.status, 'RECEIVED');

    // 4. Invariant checks: Store A confirmed deduction, Store B gained 5 units
    const storeAAfter = await Inventory.findOne({ productId: testProduct._id, locationId: storeA._id }).lean();
    assert.equal(storeAAfter.onHandStock, 20);
    assert.equal(storeAAfter.reservedStock, 0);

    const storeBAfter = await Inventory.findOne({ productId: testProduct._id, locationId: storeB._id }).lean();
    assert.equal(storeBAfter.onHandStock, 5);
    assert.equal(storeBAfter.availableStock, 5);
  });

  it('GET /api/v1/analytics/stores/sales aggregates store GMV and order metrics', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/stores/sales`, {
      headers: { Cookie: adminCookie }
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.ok(body.data[0].grossRevenue > 0);
  });

  it('GET /api/v1/analytics/inventory/health aggregates stock health across network', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/inventory/health`, {
      headers: { Cookie: adminCookie }
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.totalPhysicalStock >= 25);
  });

  it('GET /api/v1/analytics/channels/split computes BOPIS vs Delivery revenue split', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/channels/split`, {
      headers: { Cookie: adminCookie }
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    const bopisChannel = body.data.find((c) => c.channel === 'BOPIS');
    assert.ok(bopisChannel, 'BOPIS channel metrics should be present');
    assert.ok(bopisChannel.revenue > 0);
  });
});
