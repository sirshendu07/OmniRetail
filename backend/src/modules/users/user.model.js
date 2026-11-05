import mongoose from 'mongoose';
import { ROLES, ALL_ROLES } from '../../common/constants/roles.js';
import { ACCOUNT_STATUS } from '../../common/constants/accountStatus.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Excluded by default from projection to prevent credential leakage
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true
    },
    phone: {
      type: String,
      trim: true,
      default: null
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.CUSTOMER,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.PENDING_VERIFICATION,
      index: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Method to strip sensitive fields when serialized to JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  return obj;
};

export const User = mongoose.model('User', userSchema);
