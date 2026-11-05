import { z } from 'zod';

export const addToCartSchema = z.object({
  body: z.object({
    productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId'),
    quantity: z.number().int().positive('Quantity must be at least 1').default(1)
  })
});

export const updateQuantitySchema = z.object({
  params: z.object({
    productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId')
  }),
  body: z.object({
    quantity: z.number().int().min(0, 'Quantity cannot be negative')
  })
});

export const removeCartItemSchema = z.object({
  params: z.object({
    productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId')
  })
});

export const applyCouponSchema = z.object({
  body: z.object({
    code: z.string().trim().min(3).max(20).toUpperCase()
  })
});
