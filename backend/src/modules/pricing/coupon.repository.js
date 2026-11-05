import { Coupon } from './coupon.model.js';

export async function createCoupon(data) {
  return Coupon.create(data);
}

export async function findCouponByCode(code) {
  return Coupon.findOne({ code: code.toUpperCase().trim() }).exec();
}

export async function incrementCouponUsage(code) {
  return Coupon.findOneAndUpdate(
    { code: code.toUpperCase().trim() },
    { $inc: { timesUsed: 1 } },
    { new: true }
  ).exec();
}

export async function findAllCoupons() {
  return Coupon.find().sort({ createdAt: -1 }).exec();
}
