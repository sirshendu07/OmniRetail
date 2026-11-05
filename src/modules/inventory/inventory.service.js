import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { inventoryRepository } from './inventory.repository.js';
import { reservationRepository } from '../reservations/reservation.repository.js';
import { RESERVATION_STATUS } from '../reservations/reservation.model.js';
import { LEDGER_TYPES } from './inventoryLedger.model.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class InventoryService {
  /**
   * Initializes or adjusts stock for a product at a location.
   */
  async setStock({ productId, locationId, quantity, userId = null, reason = 'Initial stock' }) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        updated = await inventoryRepository.initializeStock(productId, locationId, quantity, session);
        await inventoryRepository.createLedgerEntry({
          productId,
          locationId,
          type: LEDGER_TYPES.INITIAL,
          quantity,
          balanceOnHand: updated.onHandStock,
          balanceAvailable: updated.availableStock,
          reason,
          performedBy: userId
        }, session);
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Checks current stock level for a product at a location.
   */
  async getStock(productId, locationId) {
    const stock = await inventoryRepository.findStock(productId, locationId);
    if (!stock) {
      throw new AppError('Stock record not found for product at this location', 404, ERROR_CODES.NOT_FOUND);
    }
    return stock;
  }

  /**
   * Atomically reserves inventory across multiple items for 15 minutes.
   */
  async createReservation({ userId, orderId = null, items }) {
    const reservationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
    const session = await mongoose.startSession();

    try {
      let createdReservation;
      await session.withTransaction(async () => {
        for (const item of items) {
          await this.reserveSingleItem(item, reservationId, userId, session);
        }
        createdReservation = await reservationRepository.createReservation({
          reservationId,
          orderId,
          userId,
          items,
          status: RESERVATION_STATUS.PENDING,
          expiresAt
        }, session);
      });
      return createdReservation;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Atomic check-and-decrement for a single line item within a transaction.
   */
  async reserveSingleItem(item, reservationId, userId, session) {
    const updated = await inventoryRepository.reserveStockAtomic(item, session);
    if (!updated) {
      throw new AppError(
        `Insufficient stock for product ${item.productId} at location ${item.locationId}`,
        409,
        ERROR_CODES.INSUFFICIENT_STOCK
      );
    }
    await inventoryRepository.createLedgerEntry({
      productId: item.productId,
      locationId: item.locationId,
      type: LEDGER_TYPES.RESERVATION_CREATED,
      quantity: -item.quantity,
      balanceOnHand: updated.onHandStock,
      balanceAvailable: updated.availableStock,
      referenceId: reservationId,
      performedBy: userId,
      reason: 'Hold stock for pending checkout'
    }, session);
  }

  /**
   * Releases an unconfirmed or expired reservation back into the available pool.
   */
  async releaseReservation(reservationId, reasonType = LEDGER_TYPES.RESERVATION_CANCELLED) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const res = await reservationRepository.findById(reservationId, session);
        if (!res || res.status !== RESERVATION_STATUS.PENDING) return;

        const newStatus = reasonType === LEDGER_TYPES.RESERVATION_EXPIRED
          ? RESERVATION_STATUS.EXPIRED
          : RESERVATION_STATUS.CANCELLED;

        await reservationRepository.updateStatus(reservationId, newStatus, session);
        for (const item of res.items) {
          await this.releaseSingleItem(item, reservationId, reasonType, session);
        }
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Restores available stock for a single reserved item.
   */
  async releaseSingleItem(item, reservationId, type, session) {
    const updated = await inventoryRepository.releaseStockAtomic(item, session);
    if (updated) {
      await inventoryRepository.createLedgerEntry({
        productId: item.productId,
        locationId: item.locationId,
        type,
        quantity: item.quantity,
        balanceOnHand: updated.onHandStock,
        balanceAvailable: updated.availableStock,
        referenceId: reservationId,
        reason: 'Restored reservation to available stock'
      }, session);
    }
  }

  /**
   * Confirms reservation upon successful order payment, permanently deducting on-hand stock.
   */
  async confirmReservation(reservationId, orderId = null) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const res = await reservationRepository.findById(reservationId, session);
        if (!res || res.status !== RESERVATION_STATUS.PENDING) {
          throw new AppError('Reservation is not active or already processed', 400, ERROR_CODES.BAD_REQUEST);
        }
        await reservationRepository.updateStatus(reservationId, RESERVATION_STATUS.CONFIRMED, session);
        for (const item of res.items) {
          await this.confirmSingleItem(item, reservationId, session);
        }
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Confirms a single reserved item into permanent inventory deduction.
   */
  async confirmSingleItem(item, reservationId, session) {
    const updated = await inventoryRepository.confirmStockAtomic(item, session);
    if (updated) {
      await inventoryRepository.createLedgerEntry({
        productId: item.productId,
        locationId: item.locationId,
        type: LEDGER_TYPES.RESERVATION_CONFIRMED,
        quantity: -item.quantity,
        balanceOnHand: updated.onHandStock,
        balanceAvailable: updated.availableStock,
        referenceId: reservationId,
        reason: 'Permanent deduction on order payment'
      }, session);
    }
  }
}

export const inventoryService = new InventoryService();
