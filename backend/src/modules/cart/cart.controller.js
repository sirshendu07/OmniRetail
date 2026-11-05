import { cartService } from './cart.service.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';

export class CartController {
  async getCart(req, res) {
    const cart = await cartService.getCart(req.user._id);
    return sendSuccess(res, 'Cart retrieved successfully', cart);
  }

  async addItem(req, res) {
    const cart = await cartService.addItem({
      userId: req.user._id,
      productId: req.body.productId,
      quantity: req.body.quantity
    });
    return sendSuccess(res, 'Item added to cart', cart);
  }

  async updateQuantity(req, res) {
    const cart = await cartService.updateQuantity({
      userId: req.user._id,
      productId: req.params.productId,
      quantity: req.body.quantity
    });
    return sendSuccess(res, 'Cart quantity updated', cart);
  }

  async removeItem(req, res) {
    const cart = await cartService.removeItem({
      userId: req.user._id,
      productId: req.params.productId
    });
    return sendSuccess(res, 'Item removed from cart', cart);
  }

  async applyCoupon(req, res) {
    const cart = await cartService.applyCoupon({
      userId: req.user._id,
      code: req.body.code
    });
    return sendSuccess(res, 'Coupon applied to cart', cart);
  }
}

export const cartController = new CartController();
