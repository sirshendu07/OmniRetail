import { z } from 'zod';

export const setStockSchema = z.object({
  body: z.object({
    productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId'),
    locationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid locationId'),
    quantity: z.number().int().min(0, 'Quantity cannot be negative'),
    reason: z.string().trim().optional()
  })
});

export const getStockSchema = z.object({
  query: z.object({
    productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId'),
    locationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid locationId')
  })
});

export const reserveStockSchema = z.object({
  body: z.object({
    orderId: z.string().optional(),
    items: z.array(
      z.object({
        productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId'),
        locationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid locationId'),
        quantity: z.number().int().positive('Quantity must be at least 1')
      })
    ).min(1, 'At least one item is required for reservation')
  })
});

export const reservationParamSchema = z.object({
  params: z.object({
    reservationId: z.string().uuid('Invalid reservationId')
  })
});
