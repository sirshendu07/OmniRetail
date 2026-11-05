import { Router } from 'express';
import * as productController from './product.controller.js';
import * as validator from './product.validator.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const productRouter = Router();

// Public catalog retrieval routes
productRouter.get('/', asyncHandler(productController.listProducts));
productRouter.get('/search', asyncHandler(productController.searchProducts));
productRouter.get(
  '/image-signature',
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVENTORY_MANAGER]),
  asyncHandler(productController.getImageSignature)
);
productRouter.get('/:id', asyncHandler(productController.getProduct));

// Protected product management routes
productRouter.post(
  '/',
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVENTORY_MANAGER]),
  csrfProtection,
  validateRequest(validator.createProductSchema),
  asyncHandler(productController.createProduct)
);

productRouter.patch(
  '/:id',
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVENTORY_MANAGER]),
  csrfProtection,
  validateRequest(validator.updateProductSchema),
  asyncHandler(productController.updateProduct)
);

productRouter.delete(
  '/:id',
  authenticate,
  authorize([ROLES.ADMIN]),
  csrfProtection,
  asyncHandler(productController.deleteProduct)
);
