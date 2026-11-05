import { paymentService } from './payment.service.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';

export class PaymentController {
  async createPaymentOrder(req, res) {
    const payment = await paymentService.createPaymentOrder({
      orderId: req.body.orderId,
      userId: req.user._id
    });
    return sendSuccess(res, 'Payment gateway order generated', payment);
  }

  async verifySignature(req, res) {
    const verified = await paymentService.verifyPaymentSignature(req.body);
    return sendSuccess(res, 'Payment signature verified and order confirmed', verified);
  }

  async handleWebhook(req, res) {
    const signature = req.headers['x-razorpay-signature'];
    const result = await paymentService.processWebhookEvent({
      rawBody: req.rawBody,
      signature,
      eventPayload: req.body
    });
    return sendSuccess(res, 'Webhook processed successfully', result);
  }
}

export const paymentController = new PaymentController();
