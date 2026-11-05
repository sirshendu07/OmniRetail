process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis, redisClient } from '../../src/infrastructure/redis/redis.client.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Product } from '../../src/modules/catalog/product.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { generateAccessToken } from '../../src/common/utils/jwt.utils.js';
import { ROLES } from '../../src/common/constants/roles.js';

describe('Catalog & Category Integration Tests', () => {
  let server = null;
  let baseUrl = '';
  let adminCookie = '';
  let categoryId = '';
  let productId = '';
  const testSku = `SKU-TEST-${Date.now()}`;

  before(async () => {
    await connectDatabase();
    await connectRedis();

    // Create active admin session in DB
    const adminSessionId = `admin-sess-${Date.now()}`;
    await Session.create({
      userId: '60d5ecb8b5c9c61234567890',
      sessionId: adminSessionId,
      hashedRefreshToken: 'admin-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const adminToken = generateAccessToken({
      userId: '60d5ecb8b5c9c61234567890',
      role: ROLES.ADMIN,
      sessionId: adminSessionId
    });
    adminCookie = `accessToken=${adminToken}`;

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Product.deleteMany({ sku: testSku });
    if (categoryId) await Category.deleteMany({ _id: categoryId });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('1. POST /api/v1/categories creates root department category', async () => {
    const res = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'test-csrf'
      },
      body: JSON.stringify({
        name: 'Electronics Test',
        description: 'Electronic gadgets and appliances'
      })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.category.level, 0);
    categoryId = body.data.category._id;
  });

  it('2. GET /api/v1/categories lists public category hierarchy', async () => {
    const res = await fetch(`${baseUrl}/api/v1/categories`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.categories));
  });

  it('3. POST /api/v1/products creates product with images and specs', async () => {
    const res = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'test-csrf'
      },
      body: JSON.stringify({
        name: 'Walmart Smart TV 55 Inch',
        sku: testSku,
        description: '4K Ultra HD Smart LED Television',
        brand: 'Onn',
        category: categoryId,
        regularPrice: 298.00,
        salePrice: 268.00,
        images: [{ url: 'https://cloudinary.com/tv.jpg', publicId: 'omni/tv-1', isPrimary: true }],
        specifications: [{ key: 'Resolution', value: '4K UHD' }],
        tags: ['television', 'smart-tv', 'electronics']
      })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.product.sku, testSku);
    productId = body.data.product._id;
  });

  it('4. POST /api/v1/products rejects duplicate SKU with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'test-csrf'
      },
      body: JSON.stringify({
        name: 'Another TV',
        sku: testSku,
        description: 'Duplicate SKU test',
        brand: 'Onn',
        category: categoryId,
        regularPrice: 300
      })
    });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.code, 'CONFLICT');
  });

  it('5. GET /api/v1/products/:id utilizes Redis Cache-Aside pattern', async () => {
    // 1st request: Cache miss -> populates Redis
    const res1 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const body1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(body1.data.product.sku, testSku);

    // Verify key exists in Redis
    const cachedString = await redisClient.get(`product:${productId}`);
    assert.ok(cachedString, 'Product must be populated in Redis cache');

    // 2nd request: Served from Redis cache
    const res2 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const body2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(body2.data.product._id, productId);
  });

  it('6. PATCH /api/v1/products/:id updates price and invalidates Redis cache', async () => {
    const res = await fetch(`${baseUrl}/api/v1/products/${productId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-CSRF-Token': 'test-csrf'
      },
      body: JSON.stringify({ regularPrice: 320.00 })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.product.regularPrice, 320.00);

    // Verify cache key was invalidated
    const cachedString = await redisClient.get(`product:${productId}`);
    assert.equal(cachedString, null, 'Cache key must be invalidated after product update');
  });

  it('7. GET /api/v1/products filters by brand, category, and price range', async () => {
    const res = await fetch(`${baseUrl}/api/v1/products?brand=Onn&category=${categoryId}&minPrice=200&maxPrice=400`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.data.products.length >= 1);
    assert.equal(body.meta.page, 1);
  });
});
