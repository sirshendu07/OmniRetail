import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendSuccess, sendCreated } from '../../src/common/utils/responseHandler.js';

describe('responseHandler Unit Tests', () => {
  it('should format success response with 200 status code', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(payload) {
        capturedJson = payload;
        return this;
      }
    };

    sendSuccess(mockRes, 'Fetched products', [{ id: 1 }], 200, { page: 1 });
    assert.equal(capturedStatus, 200);
    assert.equal(capturedJson.success, true);
    assert.equal(capturedJson.message, 'Fetched products');
    assert.deepEqual(capturedJson.data, [{ id: 1 }]);
    assert.deepEqual(capturedJson.meta, { page: 1 });
  });

  it('should format sendCreated response with 201 status code', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(payload) {
        capturedJson = payload;
        return this;
      }
    };

    sendCreated(mockRes, 'Order placed', { orderId: 'ORD-101' });
    assert.equal(capturedStatus, 201);
    assert.equal(capturedJson.success, true);
    assert.equal(capturedJson.message, 'Order placed');
    assert.deepEqual(capturedJson.data, { orderId: 'ORD-101' });
  });
});
