import * as userRepo from './user.repository.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';
import { AppError } from '../../common/errors/AppError.js';

export async function getCurrentUser(req, res) {
  const user = await userRepo.findUserById(req.user.id);
  if (!user) {
    throw AppError.notFound('User profile not found');
  }
  return sendSuccess(res, 'Current user profile retrieved', { user: user.toJSON() });
}
