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
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';
import { geminiService } from '../../src/infrastructure/ai/gemini.service.js';

describe('Generative AI Assistant & Semantic Product Search Tests', () => {
  let server = null;
  let baseUrl = '';
  let adminUser;
  let adminCookie = '';
  let testCategory;
  let testProduct;
  let testLocation;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    adminUser = await User.create({
      firstName: 'AI',
      lastName: 'Admin',
      email: `ai.admin.${Date.now()}@walmart.com`,
      passwordHash: 'argon2id_mock_hash',
      role: ROLES.ADMIN,
      isEmailVerified: true
    });

    const sessionId = `ai-sess-${Date.now()}`;
    await Session.create({
      userId: adminUser._id,
      sessionId,
      hashedRefreshToken: 'ai-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const token = generateAccessToken({
      userId: adminUser._id,
      role: adminUser.role,
      sessionId
    });
    adminCookie = `accessToken=${token}`;

    testCategory = await Category.create({
      name: 'AI Gadgets Cat',
      slug: `ai-gadgets-${Date.now()}`
    });

    testProduct = await Product.create({
      name: 'Apple iPad Pro M4 OLED',
      sku: `SKU-IPAD-${Date.now()}`,
      description: '13-inch Ultra Retina XDR display with M4 chip',
      brand: 'Apple',
      category: testCategory._id,
      regularPrice: 129900
    });

    testLocation = await Location.create({
      code: `LOC-AI-${Date.now()}`,
      name: 'Walmart Silicon Valley',
      type: 'STORE',
      address: { street: '1 Apple Park', city: 'Cupertino', state: 'CA', postalCode: '95014', country: 'USA' },
      geo: { type: 'Point', coordinates: [-122.01, 37.33] }
    });

    await Inventory.create({
      productId: testProduct._id,
      locationId: testLocation._id,
      onHandStock: 15,
      availableStock: 15,
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
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      await Inventory.deleteMany({ productId: testProduct._id });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testLocation) await Location.deleteOne({ _id: testLocation._id });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('POST /api/v1/ai/products/:productId/index generates vector embedding and indexes into Qdrant', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/products/${testProduct._id}/index`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'X-CSRF-Token': 'csrf-token'
      }
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.productId, testProduct._id.toString());
  });

  it('POST /api/v1/ai/semantic-search executes vector search and returns ranked products', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/semantic-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'high end tablet for digital art and drawing with OLED screen',
        limit: 3
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.query);
  });

  it('POST /api/v1/ai/chat interacts with intelligent retail assistant', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can you help me check if my order was placed?'
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.reply.length > 10);
  });

  it('executes Gemini function calling retail tool check_product_stock directly', async () => {
    const toolResult = await geminiService.executeTool('check_product_stock', {
      productId: testProduct._id.toString(),
      locationId: testLocation._id.toString()
    });

    assert.equal(toolResult.availableStock, 15);
    assert.equal(toolResult.onHandStock, 15);
  });

  it('executes Gemini function calling retail tool find_nearest_store directly', async () => {
    const toolResult = await geminiService.executeTool('find_nearest_store', {
      longitude: -122.02,
      latitude: 37.34
    });

    assert.ok(Array.isArray(toolResult.stores));
    assert.ok(toolResult.stores.length >= 1);
    assert.equal(toolResult.stores[0].city, 'Cupertino');
  });
});
