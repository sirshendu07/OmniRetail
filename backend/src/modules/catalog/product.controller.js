import * as productService from './product.service.js';
import * as cloudinaryService from '../../infrastructure/cloudinary/cloudinary.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export async function createProduct(req, res) {
  const product = await productService.createProduct(req.body);
  return sendCreated(res, 'Product created successfully', { product });
}

export async function listProducts(req, res) {
  const result = await productService.listProducts(req.query);
  return sendSuccess(res, 'Products retrieved successfully', { products: result.products }, 200, result.meta);
}

export async function searchProducts(req, res) {
  const result = await productService.searchProducts(req.query.q, req.query.page, req.query.limit);
  return sendSuccess(res, 'Search results retrieved', { products: result.products }, 200, result.meta);
}

export async function getProduct(req, res) {
  const product = await productService.getProductById(req.params.id);
  return sendSuccess(res, 'Product details retrieved', { product });
}

export async function updateProduct(req, res) {
  const product = await productService.updateProduct(req.params.id, req.body);
  return sendSuccess(res, 'Product updated successfully', { product });
}

export async function deleteProduct(req, res) {
  await productService.deleteProduct(req.params.id);
  return sendSuccess(res, 'Product deleted successfully');
}

export async function getImageSignature(_req, res) {
  const signatureData = cloudinaryService.generateUploadSignature();
  return sendSuccess(res, 'Upload signature generated', signatureData);
}
