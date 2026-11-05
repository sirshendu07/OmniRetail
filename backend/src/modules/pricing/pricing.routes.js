import { Router } from 'express';
import * as pricingController from './pricing.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const pricingRouter = Router();

pricingRouter.post('/calculate', asyncHandler(pricingController.calculateCartPricing));

pricingRouter.post(
  '/coupons',
  authenticate,
  authorize([ROLES.ADMIN]),
  csrfProtection,
  asyncHandler(pricingController.createCoupon)
);

pricingRouter.get(
  '/coupons',
  authenticate,
  authorize([ROLES.ADMIN]),
  asyncHandler(pricingController.listCoupons)
);
