import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/redis.client.js';
import { Product } from '../../src/modules/catalog/product.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Location } from '../../src/modules/locations/location.model.js';
import { Inventory } from '../../src/modules/inventory/inventory.model.js';
import { Reservation, RESERVATION_STATUS } from '../../src/modules/reservations/reservation.model.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import { sweepExpiredReservations } from '../../src/workers/reservation.worker.js';

describe('Concurrency-Safe Inventory Engine Stress Tests', () => {
  let testCategory;
  let testProduct;
  let testLocation;
  const testUserId = new mongoose.Types.ObjectId();

  before(async () => {
    await connectDatabase();
    await connectRedis();

    testCategory = await Category.create({
      name: 'Electronics Flash Sale',
      slug: `elec-flash-${Date.now()}`
    });

    testProduct = await Product.create({
      sku: `SKU-RACE-${Date.now()}`,
      name: 'High-Demand Flash Sale Item',
      description: 'Extremely limited edition flagship product',
      brand: 'OmniTech',
      category: testCategory._id,
      regularPrice: 9999
    });

    testLocation = await Location.create({
      code: `LOC-RACE-${Date.now()}`,
      name: 'Walmart Supercenter #100',
      type: 'STORE',
      address: {
        street: '123 Main St',
        city: 'Bentonville',
        state: 'Arkansas',
        postalCode: '72712',
        country: 'USA'
      },
      geo: {
        type: 'Point',
        coordinates: [-94.218, 36.372]
      }
    });
  });

  after(async () => {
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      await Inventory.deleteMany({ productId: testProduct._id });
      await Reservation.deleteMany({ 'items.productId': testProduct._id });
    }
    if (testCategory) {
      await Category.deleteOne({ _id: testCategory._id });
    }
    if (testLocation) {
      await Location.deleteOne({ _id: testLocation._id });
    }
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('prevents overselling under 10 concurrent reservation race conditions (1 stock unit)', async () => {
    // 1. Initialize stock with exactly 1 available unit
    await inventoryService.setStock({
      productId: testProduct._id,
      locationId: testLocation._id,
      quantity: 1,
      userId: testUserId,
      reason: 'Race condition test seed'
    });

    // 2. Fire 10 simultaneous reservation requests
    const CONCURRENT_REQUESTS = 10;
    const requests = Array.from({ length: CONCURRENT_REQUESTS }, () =>
      inventoryService.createReservation({
        userId: testUserId,
        items: [{ productId: testProduct._id, locationId: testLocation._id, quantity: 1 }]
      })
    );

    const results = await Promise.allSettled(requests);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // 3. Invariants verification: Exactly 1 wins, 9 fail
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent reservation should succeed');
    assert.equal(rejected.length, 9, 'Exactly nine concurrent reservations must fail');

    // 4. Verify database state: Stock is strictly non-negative
    const finalStock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();

    assert.equal(finalStock.onHandStock, 1);
    assert.equal(finalStock.reservedStock, 1);
    assert.equal(finalStock.availableStock, 0, 'Available stock should reach 0, never negative');

    // 5. Release the winning reservation and verify stock returns to available pool
    const winningReservation = fulfilled[0].value;
    await inventoryService.releaseReservation(winningReservation.reservationId);

    const releasedStock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();

    assert.equal(releasedStock.reservedStock, 0);
    assert.equal(releasedStock.availableStock, 1);
  });

  it('sweeps and restores stock for expired reservations', async () => {
    // 1. Create a reservation that expired 1 minute ago
    const expiredRes = await Reservation.create({
      reservationId: `expired-${Date.now()}`,
      userId: testUserId,
      items: [{ productId: testProduct._id, locationId: testLocation._id, quantity: 1 }],
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60000)
    });

    // Manually reserve 1 unit in inventory
    await Inventory.updateOne(
      { productId: testProduct._id, locationId: testLocation._id },
      { $inc: { availableStock: -1, reservedStock: 1 } }
    );

    // 2. Trigger expiration worker sweep
    await sweepExpiredReservations();

    // 3. Verify reservation status and restored stock
    const updatedRes = await Reservation.findOne({ reservationId: expiredRes.reservationId });
    assert.equal(updatedRes.status, RESERVATION_STATUS.EXPIRED);

    const currentStock = await Inventory.findOne({
      productId: testProduct._id,
      locationId: testLocation._id
    }).lean();

    assert.equal(currentStock.availableStock, 1);
    assert.equal(currentStock.reservedStock, 0);
  });
});
