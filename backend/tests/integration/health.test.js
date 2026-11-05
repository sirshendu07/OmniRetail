import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../src/app.js';
import { disconnectDatabase } from '../../src/database/connection.js';
import { disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';

describe('App & Health Check Integration Tests', () => {
  let server = null;
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('GET /health/live returns 200 with UP status', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'UP');
    assert.ok(typeof body.data.uptime === 'number');
  });

  it('GET /health/ready returns service dependencies status', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    const body = await res.json();

    assert.ok(res.status === 200 || res.status === 503);
    assert.ok(body.data.database !== undefined);
    assert.ok(body.data.redis !== undefined);
    assert.ok(body.data.kafka !== undefined);
  });

  it('GET /api/v1 returns operational status', async () => {
    const res = await fetch(`${baseUrl}/api/v1`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.version, '1.0.0');
  });

  it('GET undefined route returns 404 with standardized error structure', async () => {
    const res = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.code, 'NOT_FOUND');
    assert.ok(Array.isArray(body.errors));
  });
});
