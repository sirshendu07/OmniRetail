import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    hashedRefreshToken: {
      type: String,
      required: true,
      index: true
    },
    previousHashedTokens: {
      type: [String],
      default: [],
      index: true
    },
    userAgent: {
      type: String,
      default: 'Unknown Device'
    },
    ipAddress: {
      type: String,
      default: 'Unknown IP'
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for active session lookups by user
sessionSchema.index({ userId: 1, isRevoked: 1 });

export const Session = mongoose.model('Session', sessionSchema);
