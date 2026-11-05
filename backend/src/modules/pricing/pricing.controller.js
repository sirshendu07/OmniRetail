import * as pricingService from './pricing.service.js';
import * as couponRepo from './coupon.repository.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export async function createCoupon(req, res) {
  const coupon = await couponRepo.createCoupon(req.body);
  return sendCreated(res, 'Coupon created successfully', { coupon });
}

export async function listCoupons(_req, res) {
  const coupons = await couponRepo.findAllCoupons();
  return sendSuccess(res, 'Coupons retrieved successfully', { coupons });
}

export async function calculateCartPricing(req, res) {
  const pricing = await pricingService.calculateOrderPricing(req.body);
  return sendSuccess(res, 'Pricing calculated successfully', pricing);
}
