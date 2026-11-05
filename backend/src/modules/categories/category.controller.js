import * as categoryService from './category.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export async function createCategory(req, res) {
  const category = await categoryService.createCategory(req.body);
  return sendCreated(res, 'Category created successfully', { category });
}

export async function listCategories(req, res) {
  const categories = await categoryService.listCategories();
  return sendSuccess(res, 'Categories retrieved successfully', { categories });
}

export async function getCategory(req, res) {
  const category = await categoryService.getCategoryById(req.params.id);
  return sendSuccess(res, 'Category retrieved successfully', { category });
}

export async function updateCategory(req, res) {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  return sendSuccess(res, 'Category updated successfully', { category });
}

export async function deleteCategory(req, res) {
  await categoryService.deleteCategory(req.params.id);
  return sendSuccess(res, 'Category deleted successfully');
}
