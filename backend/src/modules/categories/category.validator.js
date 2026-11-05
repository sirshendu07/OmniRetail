import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Category name must be at least 2 characters').max(100).trim(),
    slug: z.string().optional(),
    description: z.string().max(500).optional(),
    parentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid parent category ObjectId').nullable().optional(),
    isActive: z.boolean().optional()
  })
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ObjectId')
  }),
  body: z.object({
    name: z.string().min(2).max(100).trim().optional(),
    slug: z.string().optional(),
    description: z.string().max(500).optional(),
    parentId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    isActive: z.boolean().optional()
  })
});
