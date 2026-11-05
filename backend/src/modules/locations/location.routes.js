import { Router } from 'express';
import { locationController } from './location.controller.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { ROLES } from '../../common/constants/roles.js';
import { createLocationSchema, nearestLocationsQuerySchema } from './location.validator.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const locationRouter = Router();

locationRouter.get(
  '/nearest',
  validateRequest(nearestLocationsQuerySchema),
  asyncHandler(locationController.getNearest)
);

locationRouter.get('/', asyncHandler(locationController.getLocations));

locationRouter.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.STORE_MANAGER),
  validateRequest(createLocationSchema),
  asyncHandler(locationController.createLocation)
);
