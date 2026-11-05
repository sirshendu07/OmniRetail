import { Router } from 'express';
import { orderController } from './order.controller.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import {
  checkoutOrderSchema,
  cancelOrderSchema,
  getOrderParamSchema
} from './order.validator.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const orderRouter = Router();

orderRouter.use(authenticate);

orderRouter.get('/', asyncHandler(orderController.listUserOrders));

orderRouter.get(
  '/:orderId',
  validateRequest(getOrderParamSchema),
  asyncHandler(orderController.getOrder)
);

orderRouter.post(
  '/checkout',
  csrfProtection,
  validateRequest(checkoutOrderSchema),
  asyncHandler(orderController.checkout)
);

orderRouter.post(
  '/:orderId/cancel',
  csrfProtection,
  validateRequest(cancelOrderSchema),
  asyncHandler(orderController.cancelOrder)
);
