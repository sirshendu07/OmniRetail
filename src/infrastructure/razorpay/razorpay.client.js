import Razorpay from 'razorpay';
import { razorpayConfig } from '../../config/razorpay.config.js';

let razorpayInstance = null;

/**
 * Returns lazy singleton instance of Razorpay client SDK.
 * @returns {Razorpay}
 */
export function getRazorpayClient() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: razorpayConfig.keyId,
      key_secret: razorpayConfig.keySecret
    });
  }
  return razorpayInstance;
}
