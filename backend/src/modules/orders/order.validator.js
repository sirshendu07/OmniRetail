import { z } from 'zod';
import { FULFILLMENT_TYPE } from './order.model.js';

export const checkoutOrderSchema = z.object({
  body: z.object({
    idempotencyKey: z.string().trim().min(8).max(64),
    fulfillmentType: z.enum([FULFILLMENT_TYPE.SHIP_TO_HOME, FULFILLMENT_TYPE.BOPIS]).default(FULFILLMENT_TYPE.SHIP_TO_HOME),
    fulfillmentLocationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid fulfillmentLocationId'),
    shippingAddress: z.object({
      street: z.string().trim().min(3),
      city: z.string().trim().min(2),
      state: z.string().trim().min(2),
      postalCode: z.string().trim().min(3),
      country: z.string().trim().default('India')
    })
  })
});

export const cancelOrderSchema = z.object({
  params: z.object({
    orderId: z.string().trim().min(5)
  }),
  body: z.object({
    reason: z.string().trim().min(3).max(255).default('Customer requested cancellation')
  })
});

export const getOrderParamSchema = z.object({
  params: z.object({
    orderId: z.string().trim().min(5)
  })
});
