import { Router } from 'express';
import { cartController } from './cart.controller.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import {
  addToCartSchema,
  updateQuantitySchema,
  removeCartItemSchema,
  applyCouponSchema
} from './cart.validator.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const cartRouter = Router();

cartRouter.use(authenticate);

cartRouter.get('/', asyncHandler(cartController.getCart));

cartRouter.post(
  '/items',
  csrfProtection,
  validateRequest(addToCartSchema),
  asyncHandler(cartController.addItem)
);

cartRouter.patch(
  '/items/:productId',
  csrfProtection,
  validateRequest(updateQuantitySchema),
  asyncHandler(cartController.updateQuantity)
);

cartRouter.delete(
  '/items/:productId',
  csrfProtection,
  validateRequest(removeCartItemSchema),
  asyncHandler(cartController.removeItem)
);

cartRouter.post(
  '/coupon',
  csrfProtection,
  validateRequest(applyCouponSchema),
  asyncHandler(cartController.applyCoupon)
);
