import { Router } from 'express';
import { aiController } from './ai.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const aiRouter = Router();

aiRouter.post('/chat', asyncHandler(aiController.chat));
aiRouter.post('/semantic-search', asyncHandler(aiController.semanticSearch));

aiRouter.post(
  '/products/:productId/index',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER),
  asyncHandler(aiController.indexProduct)
);
