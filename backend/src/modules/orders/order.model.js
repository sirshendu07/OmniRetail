import mongoose from 'mongoose';

export const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CONFIRMED: 'CONFIRMED',
  ALLOCATED: 'ALLOCATED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
});

export const FULFILLMENT_TYPE = Object.freeze({
  SHIP_TO_HOME: 'SHIP_TO_HOME',
  BOPIS: 'BOPIS' // Buy Online, Pick Up In Store
});

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    items: [orderItemSchema],
    fulfillmentType: {
      type: String,
      enum: Object.values(FULFILLMENT_TYPE),
      default: FULFILLMENT_TYPE.SHIP_TO_HOME
    },
    fulfillmentLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true
    },
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true, default: 'India' }
    },
    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, required: true, default: 0 },
      tax: { type: Number, required: true, default: 0 },
      shippingFee: { type: Number, required: true, default: 0 },
      grandTotal: { type: Number, required: true }
    },
    couponCode: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING_PAYMENT,
      index: true
    },
    reservationId: { type: String, default: null },
    payment: {
      razorpayOrderId: { type: String, default: null },
      razorpayPaymentId: { type: String, default: null },
      razorpaySignature: { type: String, default: null },
      paidAt: { type: Date, default: null }
    },
    cancellationReason: { type: String, default: null }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
