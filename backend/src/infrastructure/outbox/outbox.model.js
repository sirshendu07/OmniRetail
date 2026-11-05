import mongoose from 'mongoose';

export const OUTBOX_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED'
});

const outboxSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    aggregateType: {
      type: String,
      required: true,
      index: true
    },
    aggregateId: {
      type: String,
      required: true,
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(OUTBOX_STATUS),
      default: OUTBOX_STATUS.PENDING,
      index: true
    },
    retries: {
      type: Number,
      default: 0
    },
    error: {
      type: String,
      default: null
    },
    publishedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for high-throughput outbox publisher polling
outboxSchema.index({ status: 1, createdAt: 1 });

export const Outbox = mongoose.model('Outbox', outboxSchema);
