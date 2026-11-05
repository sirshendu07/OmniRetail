import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { orderRepository } from './order.repository.js';
import { cartRepository } from '../cart/cart.repository.js';
import { cartService } from '../cart/cart.service.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { outboxRepository } from '../../infrastructure/outbox/outbox.repository.js';
import { createEventEnvelope } from '../../infrastructure/kafka/eventEnvelope.js';
import { ORDER_STATUS } from './order.model.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class OrderService {
  /**
   * Creates an order from current cart within an atomic transaction with outbox event.
   */
  async checkout({ userId, idempotencyKey, fulfillmentType, fulfillmentLocationId, shippingAddress }) {
    const existing = await orderRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const cart = await cartRepository.findByUserId(userId);
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cannot create order from an empty cart', 400, ERROR_CODES.BAD_REQUEST);
    }

    const breakdown = await cartService.calculateFreshCartBreakdown(cart);
    return this.executeAtomicCheckout({
      userId,
      idempotencyKey,
      fulfillmentType,
      fulfillmentLocationId,
      shippingAddress,
      breakdown,
      couponCode: cart.couponCode
    });
  }

  /**
   * Executes atomic order creation, inventory reservation, and outbox event persistence.
   */
  async executeAtomicCheckout(params) {
    const session = await mongoose.startSession();
    try {
      let createdOrder;
      await session.withTransaction(async () => {
        const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const reservation = await this.reserveCartInventory(params, orderId, session);
        const orderPayload = this.buildOrderPayload(params, orderId, reservation.reservationId);

        createdOrder = await orderRepository.createOrder(orderPayload, session);
        await this.writeOrderCreatedOutbox(createdOrder, session);
        await cartRepository.clearCart(params.userId, session);
      });
      return createdOrder;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reserves inventory stock for each cart item at fulfillment location.
   */
  async reserveCartInventory(params, orderId, session) {
    const reservationItems = params.breakdown.items.map((item) => ({
      productId: item.product._id,
      locationId: params.fulfillmentLocationId,
      quantity: item.quantity
    }));

    return inventoryService.createReservation({
      userId: params.userId,
      orderId,
      items: reservationItems
    });
  }

  /**
   * Constructs order document payload.
   */
  buildOrderPayload(params, orderId, reservationId) {
    const orderItems = params.breakdown.items.map((item) => ({
      productId: item.product._id,
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.currentUnitPrice,
      lineTotal: item.lineTotal,
      locationId: params.fulfillmentLocationId
    }));

    return {
      orderId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      items: orderItems,
      fulfillmentType: params.fulfillmentType,
      fulfillmentLocationId: params.fulfillmentLocationId,
      shippingAddress: params.shippingAddress,
      pricing: {
        subtotal: params.breakdown.subtotal,
        discount: params.breakdown.discount,
        tax: Math.round(params.breakdown.subtotal * 0.05),
        shippingFee: params.breakdown.grandTotal > 500 ? 0 : 50,
        grandTotal: params.breakdown.grandTotal + Math.round(params.breakdown.subtotal * 0.05)
      },
      couponCode: params.couponCode,
      status: ORDER_STATUS.PENDING_PAYMENT,
      reservationId
    };
  }

  /**
   * Persists transactional outbox event for OrderCreated.
   */
  async writeOrderCreatedOutbox(order, session) {
    const envelope = createEventEnvelope({
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: order.orderId,
      payload: {
        orderId: order.orderId,
        userId: order.userId,
        grandTotal: order.pricing.grandTotal,
        items: order.items,
        reservationId: order.reservationId
      }
    });

    await outboxRepository.createEvent(envelope, session);
  }

  /**
   * Cancels order and releases reserved inventory stock.
   */
  async cancelOrder(orderId, userId, role, reason) {
    const order = await orderRepository.findByOrderId(orderId);
    if (!order) throw new AppError('Order not found', 404, ERROR_CODES.NOT_FOUND);

    if (role !== 'ADMIN' && order.userId.toString() !== userId.toString()) {
      throw new AppError('Forbidden: Not authorized to cancel this order', 403, ERROR_CODES.FORBIDDEN);
    }

    if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CONFIRMED].includes(order.status)) {
      throw new AppError(`Cannot cancel order in status: ${order.status}`, 400, ERROR_CODES.BAD_REQUEST);
    }

    return this.executeOrderCancellation(order, reason);
  }

  /**
   * Atomic cancellation state update, inventory release, and outbox event write.
   */
  async executeOrderCancellation(order, reason) {
    const session = await mongoose.startSession();
    try {
      let cancelled;
      await session.withTransaction(async () => {
        cancelled = await orderRepository.updateStatus(order.orderId, ORDER_STATUS.CANCELLED, {
          cancellationReason: reason,
          session
        });
        if (order.reservationId) {
          await inventoryService.releaseReservation(order.reservationId);
        }
        const envelope = createEventEnvelope({
          eventType: 'OrderCancelled',
          aggregateType: 'Order',
          aggregateId: order.orderId,
          payload: { orderId: order.orderId, reason }
        });
        await outboxRepository.createEvent(envelope, session);
      });
      return cancelled;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Retrieves single order by business orderId.
   */
  async getOrder(orderId, userId, role) {
    const order = await orderRepository.findByOrderId(orderId);
    if (!order) throw new AppError('Order not found', 404, ERROR_CODES.NOT_FOUND);

    if (role !== 'ADMIN' && order.userId.toString() !== userId.toString()) {
      throw new AppError('Forbidden: Access denied', 403, ERROR_CODES.FORBIDDEN);
    }
    return order;
  }

  /**
   * Retrieves order history for a customer.
   */
  async getUserOrders(userId, pagination) {
    return orderRepository.findByUserId(userId, pagination);
  }
}

export const orderService = new OrderService();
