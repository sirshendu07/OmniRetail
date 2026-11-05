import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { transferRepository } from './transfer.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { LEDGER_TYPES } from '../inventory/inventoryLedger.model.js';
import { TRANSFER_STATUS } from './transfer.model.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class TransferService {
  /**
   * Initiates an inter-store inventory transfer request.
   */
  async requestTransfer({ fromLocationId, toLocationId, items, userId }) {
    if (fromLocationId.toString() === toLocationId.toString()) {
      throw new AppError('Origin and destination locations cannot be identical', 400, ERROR_CODES.BAD_REQUEST);
    }

    const transferId = crypto.randomUUID();
    const session = await mongoose.startSession();

    try {
      let created;
      await session.withTransaction(async () => {
        for (const item of items) {
          await this.reserveOriginStock(item, fromLocationId, transferId, userId, session);
        }
        created = await transferRepository.createTransfer({
          transferId,
          fromLocationId,
          toLocationId,
          items,
          requestedBy: userId,
          status: TRANSFER_STATUS.REQUESTED
        }, session);
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reserves stock at origin location during transfer request.
   */
  async reserveOriginStock(item, locationId, transferId, userId, session) {
    const updated = await inventoryRepository.reserveStockAtomic({
      productId: item.productId,
      locationId,
      quantity: item.quantity
    }, session);

    if (!updated) {
      throw new AppError(`Insufficient available stock at origin location for product ${item.productId}`, 409, ERROR_CODES.INSUFFICIENT_STOCK);
    }

    await inventoryRepository.createLedgerEntry({
      productId: item.productId,
      locationId,
      type: LEDGER_TYPES.TRANSFER_OUT,
      quantity: -item.quantity,
      balanceOnHand: updated.onHandStock,
      balanceAvailable: updated.availableStock,
      referenceId: transferId,
      performedBy: userId,
      reason: 'Stock transfer hold at origin'
    }, session);
  }

  /**
   * Dispatches transfer, transitioning state to IN_TRANSIT.
   */
  async dispatchTransfer(transferId) {
    const transfer = await transferRepository.findById(transferId);
    if (!transfer || transfer.status !== TRANSFER_STATUS.REQUESTED) {
      throw new AppError('Transfer not in REQUESTED status', 400, ERROR_CODES.BAD_REQUEST);
    }
    return transferRepository.updateStatus(transferId, TRANSFER_STATUS.IN_TRANSIT, { dispatchedAt: new Date() });
  }

  /**
   * Receives stock at destination location, crediting inventory atomically.
   */
  async receiveTransfer(transferId, userId) {
    const session = await mongoose.startSession();
    try {
      let received;
      await session.withTransaction(async () => {
        const transfer = await transferRepository.findById(transferId, session);
        if (!transfer || transfer.status !== TRANSFER_STATUS.IN_TRANSIT) {
          throw new AppError('Transfer must be IN_TRANSIT to receive', 400, ERROR_CODES.BAD_REQUEST);
        }

        for (const item of transfer.items) {
          await this.creditDestinationStock(item, transfer.fromLocationId._id, transfer.toLocationId._id, transferId, userId, session);
        }

        received = await transferRepository.updateStatus(transferId, TRANSFER_STATUS.RECEIVED, {
          receivedBy: userId,
          receivedAt: new Date()
        }, session);
      });
      return received;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Confirms stock deduction from origin and increases available stock at destination.
   */
  async creditDestinationStock(item, fromLocationId, toLocationId, transferId, userId, session) {
    await inventoryRepository.confirmStockAtomic({
      productId: item.productId._id || item.productId,
      locationId: fromLocationId,
      quantity: item.quantity
    }, session);

    const destStock = await inventoryRepository.initializeStock(
      item.productId._id || item.productId,
      toLocationId,
      item.quantity,
      session
    );

    await inventoryRepository.createLedgerEntry({
      productId: item.productId._id || item.productId,
      locationId: toLocationId,
      type: LEDGER_TYPES.TRANSFER_IN,
      quantity: item.quantity,
      balanceOnHand: destStock.onHandStock,
      balanceAvailable: destStock.availableStock,
      referenceId: transferId,
      performedBy: userId,
      reason: 'Received inter-store stock transfer'
    }, session);
  }

  /**
   * Lists transfers with filters.
   */
  async listTransfers(filter) {
    return transferRepository.listTransfers(filter);
  }
}

export const transferService = new TransferService();
