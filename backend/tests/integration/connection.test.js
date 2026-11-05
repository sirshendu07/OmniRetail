import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, disconnectDatabase, isDatabaseHealthy } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/infrastructure/redis/redis.client.js';

describe('Live Infrastructure Connectivity Verification', () => {
  after(async () => {
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('connects to MongoDB Atlas and verifies replica-set state', async () => {
    const conn = await connectDatabase();
    assert.ok(conn, 'Mongoose connection instance returned');
    assert.equal(isDatabaseHealthy(), true, 'Database state is reported as healthy (1)');
  });

  it('connects to Redis via TLS and verifies PING/PONG', async () => {
    const connected = await connectRedis();
    assert.equal(connected, true, 'Redis connect succeeded');
    const healthy = await isRedisHealthy();
    assert.equal(healthy, true, 'Redis responds to PING command with PONG');
  });
});
