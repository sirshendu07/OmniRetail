import { Transfer } from './transfer.model.js';

export class TransferRepository {
  /**
   * Creates a new stock transfer request.
   */
  async createTransfer(data, session = null) {
    const [transfer] = await Transfer.create([data], { session });
    return transfer;
  }

  /**
   * Finds transfer by transferId with populated locations and products.
   */
  async findById(transferId, session = null) {
    return Transfer.findOne({ transferId })
      .populate('fromLocationId toLocationId items.productId')
      .session(session);
  }

  /**
   * Lists transfers filtered by location and status.
   */
  async listTransfers({ locationId, status, limit = 20 } = {}) {
    const query = {};
    if (locationId) {
      query.$or = [{ fromLocationId: locationId }, { toLocationId: locationId }];
    }
    if (status) query.status = status;

    return Transfer.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('fromLocationId toLocationId')
      .lean();
  }

  /**
   * Updates transfer status and tracking timestamps.
   */
  async updateStatus(transferId, status, extra = {}, session = null) {
    return Transfer.findOneAndUpdate(
      { transferId },
      { $set: { status, ...extra } },
      { new: true, session }
    );
  }
}

export const transferRepository = new TransferRepository();
