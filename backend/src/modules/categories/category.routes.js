import { Router } from 'express';
import * as categoryController from './category.controller.js';
import * as validator from './category.validator.js';
import { validateRequest } from '../../common/middleware/validateRequest.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { csrfProtection } from '../../common/middleware/csrfProtection.js';
import { ROLES } from '../../common/constants/roles.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const categoryRouter = Router();

categoryRouter.get('/', asyncHandler(categoryController.listCategories));
categoryRouter.get('/:id', asyncHandler(categoryController.getCategory));

// Admin-protected mutation routes
categoryRouter.post(
  '/',
  authenticate,
  authorize([ROLES.ADMIN]),
  csrfProtection,
  validateRequest(validator.createCategorySchema),
  asyncHandler(categoryController.createCategory)
);

categoryRouter.patch(
  '/:id',
  authenticate,
  authorize([ROLES.ADMIN]),
  csrfProtection,
  validateRequest(validator.updateCategorySchema),
  asyncHandler(categoryController.updateCategory)
);

categoryRouter.delete(
  '/:id',
  authenticate,
  authorize([ROLES.ADMIN]),
  csrfProtection,
  asyncHandler(categoryController.deleteCategory)
);
