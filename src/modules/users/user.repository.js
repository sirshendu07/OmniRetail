import { User } from './user.model.js';
import { ACCOUNT_STATUS } from '../../common/constants/accountStatus.js';

/**
 * Finds a user by email with optional passwordHash projection.
 * @param {string} email 
 * @param {boolean} [includePassword=false] 
 */
export async function findUserByEmail(email, includePassword = false) {
  const query = User.findOne({ email: email.toLowerCase().trim() });
  if (includePassword) {
    query.select('+passwordHash');
  }
  return query.exec();
}

/**
 * Finds an active user by their ObjectId.
 * @param {string} id 
 */
export async function findUserById(id) {
  return User.findById(id).exec();
}

/**
 * Inserts a new user record.
 * @param {Object} userData 
 */
export async function createUser(userData) {
  return User.create(userData);
}

/**
 * Updates user verification status to active and verified.
 * @param {string} email 
 */
export async function markEmailVerified(email) {
  return User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { isEmailVerified: true, status: ACCOUNT_STATUS.ACTIVE },
    { new: true }
  ).exec();
}

/**
 * Updates user fields by user ID.
 * @param {string} id 
 * @param {Object} updates 
 */
export async function updateUserById(id, updates) {
  return User.findByIdAndUpdate(id, updates, { new: true }).exec();
}
