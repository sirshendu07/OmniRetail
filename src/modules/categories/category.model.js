import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: 100
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    },
    level: {
      type: Number,
      default: 0, // 0 = Root Department (e.g. Electronics), 1 = Category (Computers), 2 = Subcategory (Laptops)
      min: 0,
      max: 5
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const Category = mongoose.model('Category', categorySchema);
