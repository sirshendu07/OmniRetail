import { Product } from './product.model.js';

export async function createProduct(data) {
  return Product.create(data);
}

export async function findProductById(id) {
  return Product.findById(id).populate('category subcategory', 'name slug').exec();
}

export async function findProductBySku(sku) {
  return Product.findOne({ sku: sku.toUpperCase().trim() }).populate('category subcategory', 'name slug').exec();
}

export async function findProducts(filter = {}, sort = { createdAt: -1 }, skip = 0, limit = 20) {
  return Product.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('category', 'name slug')
    .exec();
}

export async function countProducts(filter = {}) {
  return Product.countDocuments(filter).exec();
}

export async function searchProducts(query, skip = 0, limit = 20) {
  return Product.find({ $text: { $search: query }, status: 'ACTIVE' }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .populate('category', 'name slug')
    .exec();
}

export async function updateProductById(id, updates) {
  return Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
    .populate('category subcategory', 'name slug')
    .exec();
}

export async function deleteProductById(id) {
  return Product.findByIdAndDelete(id).exec();
}

export const productRepository = {
  findById: findProductById,
  create: createProduct,
  findBySku: findProductBySku,
  find: findProducts,
  search: searchProducts,
  updateById: updateProductById,
  deleteById: deleteProductById
};
