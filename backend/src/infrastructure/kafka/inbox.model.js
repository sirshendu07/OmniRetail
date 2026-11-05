import mongoose from 'mongoose';

const inboxSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      index: true
    },
    consumerGroup: {
      type: String,
      required: true,
      index: true
    },
    topic: {
      type: String,
      required: true
    },
    processedAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24 * 7 // 7 days TTL automatic expiration
    }
  },
  {
    versionKey: false
  }
);

// Compound unique index ensuring idempotency per consumer group
inboxSchema.index({ messageId: 1, consumerGroup: 1 }, { unique: true });

export const Inbox = mongoose.model('Inbox', inboxSchema);
