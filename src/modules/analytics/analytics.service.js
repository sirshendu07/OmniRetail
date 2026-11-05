import { Order } from '../orders/order.model.js';
import { Inventory } from '../inventory/inventory.model.js';

export class AnalyticsService {
  /**
   * Aggregates store-level Gross Merchandise Value (GMV), order counts, and AOV.
   */
  async getStoreSalesMetrics(startDate = null, endDate = null) {
    const matchStage = {
      status: { $in: ['CONFIRMED', 'ALLOCATED', 'SHIPPED', 'DELIVERED'] }
    };
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    return Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$fulfillmentLocationId',
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: '$pricing.grandTotal' },
          avgOrderValue: { $avg: '$pricing.grandTotal' }
        }
      },
      {
        $lookup: {
          from: 'locations',
          localField: '_id',
          foreignField: '_id',
          as: 'location'
        }
      },
      { $unwind: '$location' },
      {
        $project: {
          locationId: '$_id',
          storeCode: '$location.code',
          storeName: '$location.name',
          totalOrders: 1,
          grossRevenue: { $round: ['$grossRevenue', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] }
        }
      },
      { $sort: { grossRevenue: -1 } }
    ]);
  }

  /**
   * Aggregates network-wide inventory health, identifying stockouts and low stock risks.
   */
  async getInventoryHealthMetrics() {
    const [metrics] = await Inventory.aggregate([
      {
        $group: {
          _id: null,
          totalSkuLocations: { $sum: 1 },
          totalPhysicalStock: { $sum: '$onHandStock' },
          totalAvailableStock: { $sum: '$availableStock' },
          totalReservedStock: { $sum: '$reservedStock' },
          outOfStockCount: {
            $sum: { $cond: [{ $eq: ['$availableStock', 0] }, 1, 0] }
          },
          lowStockRiskCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$availableStock', 0] },
                    { $lte: ['$availableStock', 5] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    return metrics || {
      totalSkuLocations: 0,
      totalPhysicalStock: 0,
      totalAvailableStock: 0,
      totalReservedStock: 0,
      outOfStockCount: 0,
      lowStockRiskCount: 0
    };
  }

  /**
   * Compares omnichannel fulfillment split between Ship-from-Store / Home and BOPIS pickup.
   */
  async getChannelSplitMetrics() {
    return Order.aggregate([
      {
        $group: {
          _id: '$fulfillmentType',
          orderVolume: { $sum: 1 },
          revenue: { $sum: '$pricing.grandTotal' }
        }
      },
      {
        $project: {
          channel: '$_id',
          orderVolume: 1,
          revenue: { $round: ['$revenue', 2] }
        }
      }
    ]);
  }
}

export const analyticsService = new AnalyticsService();
