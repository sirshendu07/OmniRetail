import mongoose from 'mongoose';

const productStatusEnum = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK'];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    altText: { type: String, default: '' }
  },
  { _id: false }
);

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const specificationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 255
    },
    sku: {
      type: String,
      required: [true, 'Product SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true
    },
    brand: {
      type: String,
      required: [true, 'Product brand is required'],
      trim: true,
      index: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
      index: true
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    },
    images: {
      type: [imageSchema],
      default: []
    },
    regularPrice: {
      type: Number,
      required: [true, 'Regular price is required'],
      min: [0, 'Price cannot be negative']
    },
    salePrice: {
      type: Number,
      default: null,
      min: [0, 'Sale price cannot be negative']
    },
    attributes: {
      type: [attributeSchema],
      default: []
    },
    specifications: {
      type: [specificationSchema],
      default: []
    },
    status: {
      type: String,
      enum: productStatusEnum,
      default: 'ACTIVE',
      index: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound indexes for multi-attribute filtering & sorting
productSchema.index({ category: 1, status: 1, regularPrice: 1 });
productSchema.index({ brand: 1, status: 1 });

// Full-text search index with weighted fields
productSchema.index(
  { name: 'text', description: 'text', brand: 'text', tags: 'text' },
  { weights: { name: 10, brand: 5, tags: 3, description: 1 }, name: 'ProductTextIndex' }
);

export const Product = mongoose.model('Product', productSchema);
