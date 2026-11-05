import { Router } from 'express';
import { inventoryController } from './inventory.controller.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { ROLES } from '../../common/constants/roles.js';
import {
  setStockSchema,
  getStockSchema,
  reserveStockSchema,
  reservationParamSchema
} from './inventory.validator.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const inventoryRouter = Router();

inventoryRouter.post(
  '/stock',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.STORE_MANAGER),
  validateRequest(setStockSchema),
  asyncHandler(inventoryController.setStock)
);

inventoryRouter.get(
  '/stock',
  authenticate,
  validateRequest(getStockSchema),
  asyncHandler(inventoryController.getStock)
);

inventoryRouter.post(
  '/reserve',
  authenticate,
  validateRequest(reserveStockSchema),
  asyncHandler(inventoryController.createReservation)
);

inventoryRouter.post(
  '/reservations/:reservationId/cancel',
  authenticate,
  validateRequest(reservationParamSchema),
  asyncHandler(inventoryController.cancelReservation)
);
