import * as productRepo from './product.repository.js';
import * as categoryRepo from '../categories/category.repository.js';
import * as cacheService from '../../infrastructure/redis/cache.service.js';
import * as cloudinaryService from '../../infrastructure/cloudinary/cloudinary.service.js';
import { AppError } from '../../common/errors/AppError.js';

const CACHE_TTL_SECONDS = 3600; // 1 hour

function parseSortOption(sortKey) {
  switch (sortKey) {
    case 'price_asc': return { regularPrice: 1 };
    case 'price_desc': return { regularPrice: -1 };
    case 'name_asc': return { name: 1 };
    case 'newest':
    default: return { createdAt: -1 };
  }
}

export async function createProduct(data) {
  const existingSku = await productRepo.findProductBySku(data.sku);
  if (existingSku) throw AppError.conflict(`Product with SKU "${data.sku}" already exists`);

  const category = await categoryRepo.findCategoryById(data.category);
  if (!category) throw AppError.notFound('Specified category does not exist');

  const product = await productRepo.createProduct(data);
  await cacheService.invalidateCachePattern('products:*');
  return product;
}

export async function getProductById(id) {
  const cacheKey = `product:${id}`;
  const cached = await cacheService.getCached(cacheKey);
  if (cached) return cached;

  const product = await productRepo.findProductById(id);
  if (!product) throw AppError.notFound('Product not found');

  await cacheService.setCached(cacheKey, product, CACHE_TTL_SECONDS);
  return product;
}

export async function listProducts({ category, brand, minPrice, maxPrice, status = 'ACTIVE', sort = 'newest', page = 1, limit = 20 }) {
  const filter = { status };
  if (category) filter.category = category;
  if (brand) filter.brand = new RegExp(`^${brand}$`, 'i');
  if (minPrice != null || maxPrice != null) {
    filter.regularPrice = {};
    if (minPrice != null) filter.regularPrice.$gte = Number(minPrice);
    if (maxPrice != null) filter.regularPrice.$lte = Number(maxPrice);
  }

  const sortOption = parseSortOption(sort);
  const skip = (Math.max(1, page) - 1) * limit;

  const [products, total] = await Promise.all([
    productRepo.findProducts(filter, sortOption, skip, limit),
    productRepo.countProducts(filter)
  ]);

  return {
    products,
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) }
  };
}

export async function searchProducts(query, page = 1, limit = 20) {
  if (!query || query.trim().length === 0) throw AppError.badRequest('Search query string is required');
  const skip = (Math.max(1, page) - 1) * limit;
  const products = await productRepo.searchProducts(query, skip, limit);
  return { products, meta: { page: Number(page), limit: Number(limit) } };
}

export async function updateProduct(id, updates) {
  const existing = await productRepo.findProductById(id);
  if (!existing) throw AppError.notFound('Product not found');

  if (updates.sku && updates.sku !== existing.sku) {
    const conflict = await productRepo.findProductBySku(updates.sku);
    if (conflict) throw AppError.conflict(`Product with SKU "${updates.sku}" already exists`);
  }

  const updated = await productRepo.updateProductById(id, updates);
  await cacheService.invalidateCache(`product:${id}`);
  await cacheService.invalidateCachePattern('products:*');
  return updated;
}

export async function deleteProduct(id) {
  const existing = await productRepo.findProductById(id);
  if (!existing) throw AppError.notFound('Product not found');

  // Asynchronously clean up associated Cloudinary image assets
  if (existing.images && existing.images.length > 0) {
    for (const img of existing.images) {
      if (img.publicId) await cloudinaryService.deleteImage(img.publicId);
    }
  }

  await productRepo.deleteProductById(id);
  await cacheService.invalidateCache(`product:${id}`);
  await cacheService.invalidateCachePattern('products:*');
  return true;
}
