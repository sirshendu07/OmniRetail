import { Order } from './order.model.js';

export class OrderRepository {
  /**
   * Creates a new order document within active transaction session.
   */
  async createOrder(orderData, session = null) {
    const [order] = await Order.create([orderData], { session });
    return order;
  }

  /**
   * Finds order by idempotency key (idempotent submission safety).
   */
  async findByIdempotencyKey(idempotencyKey, session = null) {
    return Order.findOne({ idempotencyKey }).session(session).lean();
  }

  /**
   * Finds order by business orderId.
   */
  async findByOrderId(orderId, session = null) {
    return Order.findOne({ orderId }).session(session);
  }

  /**
   * Lists customer orders with pagination.
   */
  async findByUserId(userId, { skip = 0, limit = 20 } = {}) {
    return Order.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Updates order status with optional cancellation reason.
   */
  async updateStatus(orderId, status, { cancellationReason = null, session = null } = {}) {
    const update = { $set: { status } };
    if (cancellationReason) update.$set.cancellationReason = cancellationReason;

    return Order.findOneAndUpdate({ orderId }, update, { new: true, session });
  }

  /**
   * Attaches Razorpay payment transaction metadata.
   */
  async attachPaymentDetails(orderId, paymentData, session = null) {
    return Order.findOneAndUpdate(
      { orderId },
      { $set: { payment: paymentData, status: 'CONFIRMED' } },
      { new: true, session }
    );
  }
}

export const orderRepository = new OrderRepository();
