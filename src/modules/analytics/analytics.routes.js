import { Router } from 'express';
import { analyticsController } from './analytics.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, authorize(ROLES.ADMIN, ROLES.STORE_MANAGER));

analyticsRouter.get('/stores/sales', asyncHandler(analyticsController.getStoreSales));
analyticsRouter.get('/inventory/health', asyncHandler(analyticsController.getInventoryHealth));
analyticsRouter.get('/channels/split', asyncHandler(analyticsController.getChannelSplit));
