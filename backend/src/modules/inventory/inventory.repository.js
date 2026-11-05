import { Inventory } from './inventory.model.js';
import { InventoryLedger } from './inventoryLedger.model.js';

export class InventoryRepository {
  /**
   * Finds inventory for specific product at specific location.
   */
  async findStock(productId, locationId, session = null) {
    return Inventory.findOne({ productId, locationId }).session(session).lean();
  }

  /**
   * Upserts or initializes stock for a product at a location.
   */
  async initializeStock(productId, locationId, quantity, session = null) {
    return Inventory.findOneAndUpdate(
      { productId, locationId },
      {
        $setOnInsert: { productId, locationId },
        $set: { onHandStock: quantity, availableStock: quantity, reservedStock: 0 }
      },
      { upsert: true, new: true, session }
    );
  }

  /**
   * Atomically reserves stock if availableStock >= quantity.
   * Lock-free atomic conditional update prevents race conditions & overselling.
   */
  async reserveStockAtomic({ productId, locationId, quantity }, session = null) {
    return Inventory.findOneAndUpdate(
      {
        productId,
        locationId,
        availableStock: { $gte: quantity }
      },
      {
        $inc: {
          availableStock: -quantity,
          reservedStock: quantity
        }
      },
      { new: true, session }
    );
  }

  /**
   * Atomically releases reserved stock back into available pool.
   */
  async releaseStockAtomic({ productId, locationId, quantity }, session = null) {
    return Inventory.findOneAndUpdate(
      {
        productId,
        locationId,
        reservedStock: { $gte: quantity }
      },
      {
        $inc: {
          reservedStock: -quantity,
          availableStock: quantity
        }
      },
      { new: true, session }
    );
  }

  /**
   * Confirms reservation upon successful checkout, deducting onHandStock.
   */
  async confirmStockAtomic({ productId, locationId, quantity }, session = null) {
    return Inventory.findOneAndUpdate(
      {
        productId,
        locationId,
        reservedStock: { $gte: quantity },
        onHandStock: { $gte: quantity }
      },
      {
        $inc: {
          reservedStock: -quantity,
          onHandStock: -quantity
        }
      },
      { new: true, session }
    );
  }

  /**
   * Records an immutable entry in the inventory ledger.
   */
  async createLedgerEntry(entryData, session = null) {
    const [entry] = await InventoryLedger.create([entryData], { session });
    return entry;
  }
}

export const inventoryRepository = new InventoryRepository();
