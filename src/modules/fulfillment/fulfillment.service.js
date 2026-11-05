import { locationRepository } from '../locations/location.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class FulfillmentService {
  /**
   * Evaluates nearest store vs warehouse sourcing based on geo proximity and real-time stock availability.
   * 
   * @param {Object} params
   * @param {number[]} params.coordinates - [longitude, latitude]
   * @param {Array<{ productId: string, quantity: number }>} params.items
   * @param {number} [params.maxDistanceMeters=50000]
   */
  async resolveOptimalFulfillmentSource({ coordinates, items, maxDistanceMeters = 50000 }) {
    const [lng, lat] = coordinates;
    const nearbyLocations = await locationRepository.findNearestLocations(lng, lat, maxDistanceMeters, 10);

    for (const location of nearbyLocations) {
      const canFulfill = await this.canLocationFulfillItems(location._id, items);
      if (canFulfill) {
        return {
          locationId: location._id,
          code: location.code,
          name: location.name,
          type: location.type,
          strategy: location.type === 'STORE' ? 'SHIP_FROM_STORE' : 'REGIONAL_WAREHOUSE',
          availableImmediately: true
        };
      }
    }

    return this.fallbackToDistributionCenter(items);
  }

  /**
   * Verifies if location has availableStock >= requested quantity for every item.
   */
  async canLocationFulfillItems(locationId, items) {
    for (const item of items) {
      const stock = await inventoryRepository.findStock(item.productId, locationId);
      if (!stock || stock.availableStock < item.quantity) {
        return false;
      }
    }
    return true;
  }

  /**
   * Fallback sourcing to central warehouse or distribution center if no local store has complete stock.
   */
  async fallbackToDistributionCenter(items) {
    const distributionCenters = await locationRepository.listLocations({ type: 'DISTRIBUTION_CENTER' });
    for (const dc of distributionCenters) {
      const canFulfill = await this.canLocationFulfillItems(dc._id, items);
      if (canFulfill) {
        return {
          locationId: dc._id,
          code: dc.code,
          name: dc.name,
          type: dc.type,
          strategy: 'CENTRAL_DISTRIBUTION_CENTER',
          availableImmediately: false
        };
      }
    }

    throw new AppError('No fulfillment center currently has sufficient stock for all items', 409, ERROR_CODES.INSUFFICIENT_STOCK);
  }

  /**
   * Checks Buy Online, Pick Up in Store (BOPIS) real-time availability for a selected store.
   */
  async checkBopisEligibility(locationId, items) {
    const location = await locationRepository.findById(locationId);
    if (!location || !location.isActive) {
      throw new AppError('Selected pickup store is currently inactive or invalid', 404, ERROR_CODES.NOT_FOUND);
    }

    const itemAvailability = [];
    let allAvailable = true;

    for (const item of items) {
      const stock = await inventoryRepository.findStock(item.productId, locationId);
      const available = stock ? stock.availableStock >= item.quantity : false;
      if (!available) allAvailable = false;

      itemAvailability.push({
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableStock: stock?.availableStock || 0,
        isAvailable: available
      });
    }

    return {
      store: { code: location.code, name: location.name, address: location.address },
      eligibleForBopis: allAvailable,
      items: itemAvailability
    };
  }
}

export const fulfillmentService = new FulfillmentService();
