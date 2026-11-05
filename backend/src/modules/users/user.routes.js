import { Router } from 'express';
import * as userController from './user.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const userRouter = Router();

userRouter.get('/me', authenticate, asyncHandler(userController.getCurrentUser));
