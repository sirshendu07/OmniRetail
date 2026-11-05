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
import { Reservation } from '../../src/modules/reservations/reservation.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';

describe('Inventory & Location API Integration Tests', () => {
  let server = null;
  let baseUrl = '';
  let adminCookie = '';
  let adminUser;
  let testCategory;
  let testProduct;
  let createdLocation;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    adminUser = await User.create({
      firstName: 'Inventory',
      lastName: 'Admin',
      email: `inv.admin.${Date.now()}@walmart.com`,
      passwordHash: 'argon2id_mock_hash',
      role: ROLES.ADMIN,
      isEmailVerified: true
    });

    const adminSessionId = `admin-sess-${Date.now()}`;
    await Session.create({
      userId: adminUser._id,
      sessionId: adminSessionId,
      hashedRefreshToken: 'admin-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const adminToken = generateAccessToken({
      userId: adminUser._id,
      role: adminUser.role,
      sessionId: adminSessionId
    });
    adminCookie = `accessToken=${adminToken}`;

    testCategory = await Category.create({
      name: 'Inventory Cat',
      slug: `inv-cat-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Inventory Test Item',
      sku: `SKU-INV-${Date.now()}`,
      description: 'Item for inventory integration tests',
      brand: 'TestBrand',
      category: testCategory._id,
      regularPrice: 500
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
      await Reservation.deleteMany({ 'items.productId': testProduct._id });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (createdLocation) await Location.deleteOne({ _id: createdLocation._id });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('POST /api/v1/locations creates a new store location with GeoJSON coordinates', async () => {
    const res = await fetch(`${baseUrl}/api/v1/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        code: `LOC-API-${Date.now()}`,
        name: 'Downtown Dallas Store',
        type: 'STORE',
        address: {
          street: '100 Main St',
          city: 'Dallas',
          state: 'TX',
          postalCode: '75201',
          country: 'USA'
        },
        coordinates: [-96.797, 32.776]
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'Downtown Dallas Store');
    createdLocation = body.data;
  });

  it('GET /api/v1/locations/nearest finds nearest location based on proximity', async () => {
    const res = await fetch(`${baseUrl}/api/v1/locations/nearest?lng=-96.8&lat=32.78&maxDistance=20000`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
  });

  it('POST /api/v1/inventory/stock sets stock level for product at location', async () => {
    const res = await fetch(`${baseUrl}/api/v1/inventory/stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        productId: testProduct._id.toString(),
        locationId: createdLocation._id.toString(),
        quantity: 50,
        reason: 'Restocking shipment'
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.availableStock, 50);
  });

  it('POST /api/v1/inventory/reserve creates a temporary reservation and cancels it cleanly', async () => {
    const res = await fetch(`${baseUrl}/api/v1/inventory/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        items: [
          {
            productId: testProduct._id.toString(),
            locationId: createdLocation._id.toString(),
            quantity: 5
          }
        ]
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.ok(body.data.reservationId);
    assert.equal(body.data.status, 'PENDING');

    const cancelRes = await fetch(`${baseUrl}/api/v1/inventory/reservations/${body.data.reservationId}/cancel`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      }
    });

    const cancelBody = await cancelRes.json();
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelBody.success, true);
  });
});
