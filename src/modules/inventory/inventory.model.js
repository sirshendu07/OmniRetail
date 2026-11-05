import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
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
    onHandStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    reservedStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    availableStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound unique index ensuring one stock record per product per location
inventorySchema.index({ productId: 1, locationId: 1 }, { unique: true });

export const Inventory = mongoose.model('Inventory', inventorySchema);
