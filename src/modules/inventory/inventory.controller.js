import { inventoryService } from './inventory.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export class InventoryController {
  async setStock(req, res) {
    const stock = await inventoryService.setStock({
      ...req.body,
      userId: req.user?._id
    });
    return sendSuccess(res, 'Stock level updated successfully', stock);
  }

  async getStock(req, res) {
    const { productId, locationId } = req.query;
    const stock = await inventoryService.getStock(productId, locationId);
    return sendSuccess(res, 'Stock level retrieved successfully', stock);
  }

  async createReservation(req, res) {
    const reservation = await inventoryService.createReservation({
      userId: req.user._id,
      orderId: req.body.orderId,
      items: req.body.items
    });
    return sendCreated(res, 'Stock reserved successfully', reservation);
  }

  async cancelReservation(req, res) {
    const { reservationId } = req.params;
    await inventoryService.releaseReservation(reservationId);
    return sendSuccess(res, 'Stock reservation cancelled and released', { reservationId });
  }
}

export const inventoryController = new InventoryController();
