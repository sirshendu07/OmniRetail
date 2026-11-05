import { Router } from 'express';
import { transferController } from './transfer.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const transferRouter = Router();

transferRouter.use(
  authenticate,
  authorize(ROLES.ADMIN, ROLES.STORE_MANAGER, ROLES.INVENTORY_MANAGER)
);

transferRouter.get('/', asyncHandler(transferController.listTransfers));
transferRouter.post('/request', asyncHandler(transferController.requestTransfer));
transferRouter.post('/:transferId/dispatch', asyncHandler(transferController.dispatchTransfer));
transferRouter.post('/:transferId/receive', asyncHandler(transferController.receiveTransfer));
