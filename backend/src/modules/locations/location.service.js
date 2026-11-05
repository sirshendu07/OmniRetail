import { locationRepository } from './location.repository.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

export class LocationService {
  /**
   * Registers a new store, warehouse, or distribution center.
   */
  async registerLocation(data) {
    const existing = await locationRepository.findByCode(data.code);
    if (existing) {
      throw new AppError('Location code already in use', 409, ERROR_CODES.CONFLICT);
    }

    const payload = {
      code: data.code,
      name: data.name,
      type: data.type,
      address: data.address,
      geo: {
        type: 'Point',
        coordinates: data.coordinates
      }
    };

    return locationRepository.createLocation(payload);
  }

  /**
   * Retrieves all locations with optional type filter.
   */
  async getAllLocations(filter) {
    return locationRepository.listLocations(filter);
  }

  /**
   * Finds nearest fulfillment centers to customer coordinates.
   */
  async getNearestFulfillmentLocations(lng, lat, maxDistance, limit) {
    return locationRepository.findNearestLocations(lng, lat, maxDistance, limit);
  }
}

export const locationService = new LocationService();
