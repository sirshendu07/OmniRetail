import { Category } from './category.model.js';

export async function createCategory(data) {
  return Category.create(data);
}

export async function findCategoryById(id) {
  return Category.findById(id).exec();
}

export async function findCategoryBySlug(slug) {
  return Category.findOne({ slug: slug.toLowerCase().trim() }).exec();
}

export async function findAllCategories(query = { isActive: true }) {
  return Category.find(query).sort({ level: 1, name: 1 }).exec();
}

export async function updateCategoryById(id, updates) {
  return Category.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).exec();
}

export async function deleteCategoryById(id) {
  return Category.findByIdAndDelete(id).exec();
}
