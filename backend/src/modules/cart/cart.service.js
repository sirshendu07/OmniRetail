import { cartRepository } from './cart.repository.js';
import { productRepository } from '../catalog/product.repository.js';
import { pricingService } from '../pricing/pricing.service.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class CartService {
  /**
   * Retrieves cart and dynamically re-evaluates current catalog prices.
   */
  async getCart(userId) {
    const cart = await cartRepository.findByUserId(userId);
    if (!cart || cart.items.length === 0) {
      return { items: [], subtotal: 0, discount: 0, grandTotal: 0, couponCode: null };
    }
    return this.calculateFreshCartBreakdown(cart);
  }

  /**
   * Re-evaluates item prices against live catalog data to detect price shifts.
   */
  async calculateFreshCartBreakdown(cart) {
    let subtotal = 0;
    const validatedItems = [];

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.status !== 'ACTIVE') continue;

      const currentPrice = pricingService.resolveEffectivePrice(product);
      const lineTotal = currentPrice * item.quantity;
      subtotal += lineTotal;

      validatedItems.push({
        product: { _id: product._id, name: product.name, sku: product.sku, images: product.images },
        quantity: item.quantity,
        currentUnitPrice: currentPrice,
        priceAtAddition: item.priceAtAddition,
        priceChanged: currentPrice !== item.priceAtAddition,
        lineTotal
      });
    }

    const { discount, coupon } = await this.resolveCartCoupon(cart.couponCode, subtotal);
    return {
      items: validatedItems,
      subtotal,
      discount,
      grandTotal: Math.max(0, subtotal - discount),
      couponCode: coupon?.code ?? null
    };
  }

  /**
   * Evaluates active coupon discount against cart subtotal.
   */
  async resolveCartCoupon(couponCode, subtotal) {
    if (!couponCode) return { discount: 0, coupon: null };
    try {
      const coupon = await pricingService.validateCoupon(couponCode, subtotal);
      const discount = pricingService.calculateCouponDiscount(coupon, subtotal);
      return { discount, coupon };
    } catch {
      return { discount: 0, coupon: null };
    }
  }

  /**
   * Adds product to user cart or increments existing quantity.
   */
  async addItem({ userId, productId, quantity }) {
    const product = await productRepository.findById(productId);
    if (!product || product.status !== 'ACTIVE') {
      throw new AppError('Product is currently unavailable', 404, ERROR_CODES.NOT_FOUND);
    }

    const cart = await cartRepository.getOrCreateCart(userId);
    const price = pricingService.resolveEffectivePrice(product);
    const existingIndex = cart.items.findIndex((item) => item.productId.toString() === productId);

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({ productId, quantity, priceAtAddition: price });
    }

    await cartRepository.saveCart(cart);
    return this.getCart(userId);
  }

  /**
   * Updates line item quantity or removes if quantity is 0.
   */
  async updateQuantity({ userId, productId, quantity }) {
    const cart = await cartRepository.getOrCreateCart(userId);
    if (quantity === 0) {
      cart.items = cart.items.filter((item) => item.productId.toString() !== productId);
    } else {
      const item = cart.items.find((item) => item.productId.toString() === productId);
      if (!item) throw new AppError('Item not present in cart', 404, ERROR_CODES.NOT_FOUND);
      item.quantity = quantity;
    }

    await cartRepository.saveCart(cart);
    return this.getCart(userId);
  }

  /**
   * Removes specific item from user cart.
   */
  async removeItem({ userId, productId }) {
    const cart = await cartRepository.getOrCreateCart(userId);
    cart.items = cart.items.filter((item) => item.productId.toString() !== productId);
    await cartRepository.saveCart(cart);
    return this.getCart(userId);
  }

  /**
   * Applies validated discount coupon to user cart.
   */
  async applyCoupon({ userId, code }) {
    const cart = await cartRepository.findByUserId(userId);
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cannot apply coupon to an empty cart', 400, ERROR_CODES.BAD_REQUEST);
    }

    const subtotal = cart.items.reduce((sum, item) => {
      const price = item.productId?.salePrice ?? item.productId?.regularPrice ?? item.priceAtAddition;
      return sum + price * item.quantity;
    }, 0);

    await pricingService.validateCoupon(code, subtotal);
    cart.couponCode = code.toUpperCase();
    await cartRepository.saveCart(cart);
    return this.getCart(userId);
  }
}

export const cartService = new CartService();
