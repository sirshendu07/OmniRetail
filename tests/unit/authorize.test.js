import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../../src/common/middleware/authorize.js';
import { ROLES } from '../../src/common/constants/roles.js';

describe('authorize Middleware Unit Tests', () => {
  it('allows access when user possesses an authorized role', async () => {
    const middleware = authorize([ROLES.ADMIN, ROLES.INVENTORY_MANAGER]);
    const req = { user: { id: 'u1', role: ROLES.ADMIN } };
    let nextCalled = false;
    let nextErr = null;

    await middleware(req, {}, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextErr, undefined);
  });

  it('rejects with 403 Forbidden when user role is not permitted', async () => {
    const middleware = authorize([ROLES.ADMIN]);
    const req = { user: { id: 'u2', role: ROLES.CUSTOMER } };
    let nextErr = null;

    await middleware(req, {}, (err) => {
      nextErr = err;
    });

    assert.ok(nextErr);
    assert.equal(nextErr.statusCode, 403);
    assert.equal(nextErr.code, 'FORBIDDEN');
  });

  it('respects resource ownership check for resource-level authorization', async () => {
    const ownershipCheck = (req) => req.params.userId === req.user.id;
    const middleware = authorize([ROLES.CUSTOMER], ownershipCheck);

    const authorizedReq = { user: { id: 'user-100', role: ROLES.CUSTOMER }, params: { userId: 'user-100' } };
    let authorizedErr = null;
    await middleware(authorizedReq, {}, (err) => {
      authorizedErr = err;
    });
    assert.equal(authorizedErr, undefined);

    const unauthorizedReq = { user: { id: 'user-100', role: ROLES.CUSTOMER }, params: { userId: 'user-999' } };
    let unauthorizedErr = null;
    await middleware(unauthorizedReq, {}, (err) => {
      unauthorizedErr = err;
    });
    assert.ok(unauthorizedErr);
    assert.equal(unauthorizedErr.statusCode, 403);
  });
});
