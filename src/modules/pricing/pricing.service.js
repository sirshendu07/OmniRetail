import * as couponRepo from './coupon.repository.js';
import { AppError } from '../../common/errors/AppError.js';

export function getEffectivePrice(product) {
  if (product.salePrice != null && product.salePrice > 0 && product.salePrice < product.regularPrice) {
    return product.salePrice;
  }
  return product.regularPrice;
}

export function validateCouponRules(coupon, subtotal) {
  const now = new Date();
  if (!coupon.isActive) throw AppError.badRequest('Coupon is no longer active');
  if (coupon.startDate > now || coupon.endDate < now) throw AppError.badRequest('Coupon has expired or is not yet valid');
  if (coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit) throw AppError.badRequest('Coupon usage limit reached');
  if (subtotal < coupon.minOrderAmount) {
    throw AppError.badRequest(`Order total must be at least $${coupon.minOrderAmount} to apply coupon`);
  }
}

export function computeDiscountAmount(coupon, subtotal) {
  if (coupon.discountType === 'PERCENTAGE') {
    const rawDiscount = (subtotal * coupon.discountValue) / 100;
    return coupon.maxDiscountAmount ? Math.min(rawDiscount, coupon.maxDiscountAmount) : rawDiscount;
  }
  return Math.min(coupon.discountValue, subtotal);
}

/**
 * Calculates authoritative order pricing strictly on the server.
 * Never trusts prices provided by client request payloads.
 */
export async function calculateOrderPricing({ items = [], couponCode = null }) {
  if (!items || items.length === 0) throw AppError.badRequest('Cart items are required for pricing');

  let subtotal = 0;
  const lineItems = items.map(({ product, quantity }) => {
    const unitPrice = getEffectivePrice(product);
    const lineTotal = Number((unitPrice * quantity).toFixed(2));
    subtotal += lineTotal;
    return {
      productId: product._id,
      sku: product.sku,
      name: product.name,
      unitPrice,
      quantity,
      lineTotal
    };
  });

  subtotal = Number(subtotal.toFixed(2));
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await couponRepo.findCouponByCode(couponCode);
    if (!coupon) throw AppError.notFound(`Coupon code "${couponCode}" not found`);
    validateCouponRules(coupon, subtotal);
    discount = Number(computeDiscountAmount(coupon, subtotal).toFixed(2));
    appliedCoupon = { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue };
  }

  const total = Number(Math.max(0, subtotal - discount).toFixed(2));
  return { subtotal, discount, total, appliedCoupon, lineItems };
}

export const pricingService = {
  resolveEffectivePrice: getEffectivePrice,
  getEffectivePrice,
  validateCouponRules,
  computeDiscountAmount,
  calculateCouponDiscount: computeDiscountAmount,
  calculateOrderPricing,
  async validateCoupon(code, subtotal) {
    const coupon = await couponRepo.findCouponByCode(code);
    if (!coupon) throw AppError.notFound(`Coupon code "${code}" not found`);
    validateCouponRules(coupon, subtotal);
    return coupon;
  }
};
