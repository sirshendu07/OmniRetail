import { Cart } from './cart.model.js';

export class CartRepository {
  /**
   * Finds cart by user ID with populated product details.
   */
  async findByUserId(userId, session = null) {
    return Cart.findOne({ userId })
      .populate('items.productId')
      .session(session);
  }

  /**
   * Gets or initializes an empty cart for user.
   */
  async getOrCreateCart(userId, session = null) {
    let cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      const [newCart] = await Cart.create([{ userId, items: [] }], { session });
      cart = newCart;
    }
    return cart;
  }

  /**
   * Saves updated cart document.
   */
  async saveCart(cart, session = null) {
    return cart.save({ session });
  }

  /**
   * Clears all items and coupon from user's cart.
   */
  async clearCart(userId, session = null) {
    return Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], couponCode: null } },
      { new: true, session }
    );
  }
}

export const cartRepository = new CartRepository();
