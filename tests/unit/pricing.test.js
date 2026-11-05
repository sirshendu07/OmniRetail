import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectivePrice,
  computeDiscountAmount,
  validateCouponRules,
  calculateOrderPricing
} from '../../src/modules/pricing/pricing.service.js';
import { AppError } from '../../src/common/errors/AppError.js';

describe('Pricing Service Unit Tests', () => {
  it('resolves effective price preferring valid salePrice over regularPrice', () => {
    const discounted = { regularPrice: 100, salePrice: 79.99 };
    assert.equal(getEffectivePrice(discounted), 79.99);

    const fullPrice = { regularPrice: 100, salePrice: null };
    assert.equal(getEffectivePrice(fullPrice), 100);

    const invalidSale = { regularPrice: 100, salePrice: 120 }; // Sale higher than regular ignored
    assert.equal(getEffectivePrice(invalidSale), 100);
  });

  it('calculates percentage coupon discount with maximum cap', () => {
    const couponWithCap = {
      discountType: 'PERCENTAGE',
      discountValue: 20, // 20%
      maxDiscountAmount: 30
    };
    // 20% of 200 = 40, capped at 30
    assert.equal(computeDiscountAmount(couponWithCap, 200), 30);

    const couponNoCap = {
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountAmount: null
    };
    // 10% of 150 = 15
    assert.equal(computeDiscountAmount(couponNoCap, 150), 15);
  });

  it('calculates flat coupon discount', () => {
    const flatCoupon = { discountType: 'FLAT', discountValue: 25 };
    assert.equal(computeDiscountAmount(flatCoupon, 100), 25);
    // Flat coupon cannot exceed subtotal
    assert.equal(computeDiscountAmount(flatCoupon, 20), 20);
  });

  it('validates coupon rules and rejects expired or inactive coupons', () => {
    const now = new Date();
    const inactiveCoupon = { isActive: false };
    assert.throws(
      () => validateCouponRules(inactiveCoupon, 100),
      (err) => err instanceof AppError && err.statusCode === 400
    );

    const expiredCoupon = {
      isActive: true,
      startDate: new Date(now.getTime() - 86400000 * 5),
      endDate: new Date(now.getTime() - 86400000), // Expired yesterday
      minOrderAmount: 0
    };
    assert.throws(
      () => validateCouponRules(expiredCoupon, 100),
      (err) => err instanceof AppError && err.statusCode === 400
    );

    const subtotalBelowMin = {
      isActive: true,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000),
      minOrderAmount: 100
    };
    assert.throws(
      () => validateCouponRules(subtotalBelowMin, 50),
      (err) => err instanceof AppError && err.statusCode === 400
    );
  });

  it('calculates complete order breakdown strictly on server', async () => {
    const mockItems = [
      { product: { _id: 'p1', sku: 'LAPTOP-01', name: 'Laptop', regularPrice: 1000, salePrice: 900 }, quantity: 1 },
      { product: { _id: 'p2', sku: 'MOUSE-01', name: 'Mouse', regularPrice: 50, salePrice: null }, quantity: 2 }
    ];

    const result = await calculateOrderPricing({ items: mockItems });
    // (900 * 1) + (50 * 2) = 1000
    assert.equal(result.subtotal, 1000);
    assert.equal(result.discount, 0);
    assert.equal(result.total, 1000);
    assert.equal(result.lineItems.length, 2);
    assert.equal(result.lineItems[0].unitPrice, 900);
    assert.equal(result.lineItems[1].lineTotal, 100);
  });
});
