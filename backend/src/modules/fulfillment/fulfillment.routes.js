import { Router } from 'express';
import { fulfillmentController } from './fulfillment.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const fulfillmentRouter = Router();

fulfillmentRouter.post('/source', asyncHandler(fulfillmentController.resolveSource));

fulfillmentRouter.post(
  '/stores/:locationId/bopis-check',
  asyncHandler(fulfillmentController.checkBopis)
);
