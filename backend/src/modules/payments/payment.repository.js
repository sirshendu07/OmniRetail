import { Payment } from './payment.model.js';

export class PaymentRepository {
  /**
   * Creates a new payment transaction record.
   */
  async createPayment(data, session = null) {
    const [payment] = await Payment.create([data], { session });
    return payment;
  }

  /**
   * Finds payment record by business orderId.
   */
  async findByOrderId(orderId, session = null) {
    return Payment.findOne({ orderId }).session(session);
  }

  /**
   * Finds payment record by Razorpay orderId.
   */
  async findByRazorpayOrderId(razorpayOrderId, session = null) {
    return Payment.findOne({ razorpayOrderId }).session(session);
  }

  /**
   * Updates payment record status with signature or error details.
   */
  async updateStatus(paymentId, status, details = {}, session = null) {
    const update = { $set: { status, ...details } };
    return Payment.findOneAndUpdate({ paymentId }, update, { new: true, session });
  }
}

export const paymentRepository = new PaymentRepository();
