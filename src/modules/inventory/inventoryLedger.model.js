import mongoose from 'mongoose';

export const LEDGER_TYPES = Object.freeze({
  INITIAL: 'INITIAL',
  ADJUSTMENT: 'ADJUSTMENT',
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  RESERVATION_CONFIRMED: 'RESERVATION_CONFIRMED',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  RESERVATION_CANCELLED: 'RESERVATION_CANCELLED',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT'
});

const inventoryLedgerSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(LEDGER_TYPES),
      required: true
    },
    quantity: {
      type: Number,
      required: true // can be positive or negative
    },
    balanceOnHand: {
      type: Number,
      required: true
    },
    balanceAvailable: {
      type: Number,
      required: true
    },
    referenceId: {
      type: String,
      default: null,
      index: true
    },
    reason: {
      type: String,
      default: null
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

// Compound index for auditing history by product and location
inventoryLedgerSchema.index({ productId: 1, locationId: 1, createdAt: -1 });

export const InventoryLedger = mongoose.model('InventoryLedger', inventoryLedgerSchema);
