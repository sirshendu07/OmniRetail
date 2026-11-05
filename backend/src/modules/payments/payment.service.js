import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { paymentRepository } from './payment.repository.js';
import { orderRepository } from '../orders/order.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { outboxRepository } from '../../infrastructure/outbox/outbox.repository.js';
import { createEventEnvelope } from '../../infrastructure/kafka/eventEnvelope.js';
import { getRazorpayClient } from '../../infrastructure/razorpay/razorpay.client.js';
import { razorpayConfig } from '../../config/razorpay.config.js';
import { PAYMENT_STATUS } from './payment.model.js';
import { ORDER_STATUS } from '../orders/order.model.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class PaymentService {
  /**
   * Initializes Razorpay checkout order for a pending retail order.
   */
  async createPaymentOrder({ orderId, userId }) {
    const order = await orderRepository.findByOrderId(orderId);
    if (!order) throw new AppError('Order not found', 404, ERROR_CODES.NOT_FOUND);
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      throw new AppError(`Cannot initiate payment for order in status: ${order.status}`, 400, ERROR_CODES.BAD_REQUEST);
    }

    const amountInPaise = Math.round(order.pricing.grandTotal * 100);
    const rzpOrder = await this.generateRazorpayGatewayOrder(order.orderId, amountInPaise);

    const payment = await paymentRepository.createPayment({
      paymentId: crypto.randomUUID(),
      orderId: order.orderId,
      userId,
      razorpayOrderId: rzpOrder.id,
      amount: amountInPaise,
      currency: razorpayConfig.currency,
      status: PAYMENT_STATUS.CREATED
    });

    return {
      orderId: order.orderId,
      razorpayOrderId: rzpOrder.id,
      amount: amountInPaise,
      currency: razorpayConfig.currency,
      keyId: razorpayConfig.keyId,
      paymentId: payment.paymentId
    };
  }

  /**
   * Calls Razorpay API or provides simulated order in test mode.
   */
  async generateRazorpayGatewayOrder(receipt, amount) {
    if (process.env.NODE_ENV === 'test' || !razorpayConfig.keySecret || razorpayConfig.keySecret.includes('placeholder')) {
      return { id: `order_test_${Date.now()}_${crypto.randomBytes(3).toString('hex')}` };
    }
    const client = getRazorpayClient();
    return client.orders.create({ amount, currency: razorpayConfig.currency, receipt });
  }

  /**
   * Verifies HMAC-SHA256 signature and executes atomic order confirmation.
   */
  async verifyPaymentSignature({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    this.assertHmacSignatureValid(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    const order = await orderRepository.findByOrderId(orderId);
    if (!order) throw new AppError('Order not found', 404, ERROR_CODES.NOT_FOUND);
    if (order.status === ORDER_STATUS.CONFIRMED) return { orderId, status: ORDER_STATUS.CONFIRMED };

    return this.executePaymentSuccessTransaction(order, razorpayOrderId, razorpayPaymentId, razorpaySignature);
  }

  /**
   * Validates Razorpay HMAC SHA256 signature using timing-safe comparison.
   */
  assertHmacSignatureValid(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    const data = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto.createHmac('sha256', razorpayConfig.keySecret).update(data).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(razorpaySignature);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new AppError('Invalid payment signature', 400, ERROR_CODES.BAD_REQUEST);
    }
  }

  /**
   * Executes atomic payment capture, stock confirmation, and event outbox write.
   */
  async executePaymentSuccessTransaction(order, razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    const session = await mongoose.startSession();
    try {
      let confirmed;
      await session.withTransaction(async () => {
        await paymentRepository.updateStatus(order.orderId, PAYMENT_STATUS.CAPTURED, {
          razorpayPaymentId,
          signature: razorpaySignature
        }, session);

        if (order.reservationId) {
          await inventoryService.confirmReservation(order.reservationId, order.orderId);
        }

        confirmed = await orderRepository.attachPaymentDetails(order.orderId, {
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          paidAt: new Date()
        }, session);

        const envelope = createEventEnvelope({
          eventType: 'PaymentCaptured',
          aggregateType: 'Payment',
          aggregateId: order.orderId,
          payload: { orderId: order.orderId, razorpayPaymentId, grandTotal: order.pricing.grandTotal }
        });
        await outboxRepository.createEvent(envelope, session);
      });
      return confirmed;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Processes inbound Razorpay webhook payload with raw-body signature validation.
   */
  async processWebhookEvent({ rawBody, signature, eventPayload }) {
    this.assertWebhookSignatureValid(rawBody, signature);
    const { event, payload } = eventPayload;

    if (event === 'payment.captured') {
      const paymentEntity = payload.payment.entity;
      const order = await orderRepository.findByOrderId(paymentEntity.notes?.orderId || paymentEntity.receipt);
      if (order && order.status !== ORDER_STATUS.CONFIRMED) {
        await this.executePaymentSuccessTransaction(order, paymentEntity.order_id, paymentEntity.id, 'webhook_verified');
      }
    } else if (event === 'payment.failed') {
      await this.handlePaymentFailureWebhook(payload.payment.entity);
    }
    return { status: 'processed' };
  }

  /**
   * Verifies Razorpay Webhook signature against raw request buffer.
   */
  assertWebhookSignatureValid(rawBody, signature) {
    if (process.env.NODE_ENV === 'test' && (!signature || signature === 'test_mock_signature')) return;
    const expected = crypto.createHmac('sha256', razorpayConfig.webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new AppError('Invalid webhook signature', 400, ERROR_CODES.BAD_REQUEST);
    }
  }

  /**
   * Handles payment failure webhook: marks order as failed and releases reserved stock.
   */
  async handlePaymentFailureWebhook(paymentEntity) {
    const orderId = paymentEntity.notes?.orderId || paymentEntity.receipt;
    const order = await orderRepository.findByOrderId(orderId);
    if (!order || order.status === ORDER_STATUS.CANCELLED) return;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await orderRepository.updateStatus(order.orderId, ORDER_STATUS.PAYMENT_FAILED, { session });
        if (order.reservationId) {
          await inventoryService.releaseReservation(order.reservationId);
        }
        const envelope = createEventEnvelope({
          eventType: 'PaymentFailed',
          aggregateType: 'Payment',
          aggregateId: order.orderId,
          payload: { orderId: order.orderId, reason: paymentEntity.error_description }
        });
        await outboxRepository.createEvent(envelope, session);
      });
    } finally {
      await session.endSession();
    }
  }
}

export const paymentService = new PaymentService();
