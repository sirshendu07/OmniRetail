import { z } from 'zod';

export const createLocationSchema = z.object({
  body: z.object({
    code: z.string().trim().min(2).max(50),
    name: z.string().trim().min(2).max(100),
    type: z.enum(['STORE', 'WAREHOUSE', 'DISTRIBUTION_CENTER']).default('STORE'),
    address: z.object({
      street: z.string().trim().min(3),
      city: z.string().trim().min(2),
      state: z.string().trim().min(2),
      postalCode: z.string().trim().min(3),
      country: z.string().trim().default('India')
    }),
    coordinates: z.tuple([
      z.number().min(-180).max(180), // longitude
      z.number().min(-90).max(90)    // latitude
    ])
  })
});

export const nearestLocationsQuerySchema = z.object({
  query: z.object({
    lng: z.coerce.number().min(-180).max(180),
    lat: z.coerce.number().min(-90).max(90),
    maxDistance: z.coerce.number().positive().default(50000),
    limit: z.coerce.number().int().min(1).max(50).default(5)
  })
});
