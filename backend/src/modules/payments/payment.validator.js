import { z } from 'zod';

export const createPaymentOrderSchema = z.object({
  body: z.object({
    orderId: z.string().trim().min(5)
  })
});

export const verifyPaymentSignatureSchema = z.object({
  body: z.object({
    orderId: z.string().trim().min(5),
    razorpayOrderId: z.string().trim().min(5),
    razorpayPaymentId: z.string().trim().min(5),
    razorpaySignature: z.string().trim().min(10)
  })
});
