import { orderService } from './order.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export class OrderController {
  async checkout(req, res) {
    const order = await orderService.checkout({
      userId: req.user._id,
      idempotencyKey: req.body.idempotencyKey,
      fulfillmentType: req.body.fulfillmentType,
      fulfillmentLocationId: req.body.fulfillmentLocationId,
      shippingAddress: req.body.shippingAddress
    });
    return sendCreated(res, 'Order created successfully', order);
  }

  async getOrder(req, res) {
    const order = await orderService.getOrder(req.params.orderId, req.user._id, req.user.role);
    return sendSuccess(res, 'Order details retrieved', order);
  }

  async listUserOrders(req, res) {
    const { skip, limit } = req.query;
    const orders = await orderService.getUserOrders(req.user._id, {
      skip: Number(skip) || 0,
      limit: Number(limit) || 20
    });
    return sendSuccess(res, 'Orders retrieved successfully', orders);
  }

  async cancelOrder(req, res) {
    const order = await orderService.cancelOrder(
      req.params.orderId,
      req.user._id,
      req.user.role,
      req.body.reason
    );
    return sendSuccess(res, 'Order cancelled successfully', order);
  }
}

export const orderController = new OrderController();
