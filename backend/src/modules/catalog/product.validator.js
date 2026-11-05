import { z } from 'zod';

const imageInputSchema = z.object({
  url: z.string().url('Image must be a valid URL'),
  publicId: z.string().min(1, 'Public ID is required'),
  isPrimary: z.boolean().optional(),
  altText: z.string().optional()
});

const attributeInputSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1)
});

const specificationInputSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1)
});

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(255).trim(),
    sku: z.string().min(3, 'SKU must be at least 3 characters').max(50).trim().toUpperCase(),
    description: z.string().min(5, 'Description must be at least 5 characters').trim(),
    brand: z.string().min(1, 'Brand is required').trim(),
    category: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ObjectId'),
    subcategory: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid subcategory ObjectId').nullable().optional(),
    images: z.array(imageInputSchema).optional(),
    regularPrice: z.number().min(0, 'Regular price cannot be negative'),
    salePrice: z.number().min(0).nullable().optional(),
    attributes: z.array(attributeInputSchema).optional(),
    specifications: z.array(specificationInputSchema).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK']).optional(),
    tags: z.array(z.string()).optional()
  })
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ObjectId')
  }),
  body: z.object({
    name: z.string().min(2).max(255).trim().optional(),
    sku: z.string().min(3).max(50).trim().toUpperCase().optional(),
    description: z.string().min(5).trim().optional(),
    brand: z.string().min(1).trim().optional(),
    category: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    subcategory: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    images: z.array(imageInputSchema).optional(),
    regularPrice: z.number().min(0).optional(),
    salePrice: z.number().min(0).nullable().optional(),
    attributes: z.array(attributeInputSchema).optional(),
    specifications: z.array(specificationInputSchema).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK']).optional(),
    tags: z.array(z.string()).optional()
  })
});
