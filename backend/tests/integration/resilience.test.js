process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';
import { connectProducer, disconnectProducer } from '../../src/infrastructure/kafka/producer.js';

describe('System Resiliency & Graceful Degradation Tests', () => {
  let server = null;
  let baseUrl = '';

  before(async () => {
    await connectDatabase();
    await connectRedis();
    await connectProducer();

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectProducer();
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('GET /health/live returns 200 OK indicating process liveness', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'UP');
    assert.ok(body.data.uptime >= 0);
  });

  it('GET /health/ready reports health of core dependencies', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.database, 'UP');
  });

  it('handles 404 for undefined endpoints with standardized error envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/non-existent-endpoint`);
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.code, 'NOT_FOUND');
    assert.ok(body.message.includes('not found'));
  });
});
