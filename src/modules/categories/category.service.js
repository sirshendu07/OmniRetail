import * as categoryRepo from './category.repository.js';
import { AppError } from '../../common/errors/AppError.js';

/**
 * Creates a slug from category name.
 * @param {string} name 
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Creates a new category, validating parent hierarchy and calculating level.
 */
export async function createCategory(data) {
  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  const existing = await categoryRepo.findCategoryBySlug(slug);
  if (existing) {
    throw AppError.conflict(`Category slug "${slug}" already exists`);
  }

  let level = 0;
  if (data.parentId) {
    const parent = await categoryRepo.findCategoryById(data.parentId);
    if (!parent) throw AppError.notFound('Parent category not found');
    level = parent.level + 1;
  }

  return categoryRepo.createCategory({ ...data, slug, level });
}

export async function listCategories() {
  return categoryRepo.findAllCategories({ isActive: true });
}

export async function getCategoryById(id) {
  const category = await categoryRepo.findCategoryById(id);
  if (!category) throw AppError.notFound('Category not found');
  return category;
}

export async function updateCategory(id, updates) {
  const category = await categoryRepo.findCategoryById(id);
  if (!category) throw AppError.notFound('Category not found');

  if (updates.name && !updates.slug) {
    updates.slug = slugify(updates.name);
  }
  return categoryRepo.updateCategoryById(id, updates);
}

export async function deleteCategory(id) {
  const category = await categoryRepo.findCategoryById(id);
  if (!category) throw AppError.notFound('Category not found');
  return categoryRepo.deleteCategoryById(id);
}
