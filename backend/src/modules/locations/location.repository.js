import { Location } from './location.model.js';

export class LocationRepository {
  /**
   * Creates a new retail location.
   */
  async createLocation(data, session = null) {
    const [created] = await Location.create([data], { session });
    return created;
  }

  /**
   * Finds location by internal code.
   */
  async findByCode(code) {
    return Location.findOne({ code: code.toUpperCase() }).lean();
  }

  /**
   * Finds location by MongoDB ID.
   */
  async findById(id) {
    return Location.findById(id).lean();
  }

  /**
   * Lists all active locations with optional type filter.
   */
  async listLocations({ type, isActive = true } = {}) {
    const query = { isActive };
    if (type) query.type = type;
    return Location.find(query).sort({ name: 1 }).lean();
  }

  /**
   * Finds nearest active locations ordered by spherical distance.
   * @param {number} longitude
   * @param {number} latitude
   * @param {number} maxDistanceMeters
   * @param {number} limit
   */
  async findNearestLocations(longitude, latitude, maxDistanceMeters = 50000, limit = 5) {
    return Location.find({
      isActive: true,
      geo: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDistanceMeters
        }
      }
    })
      .limit(limit)
      .lean();
  }
}

export const locationRepository = new LocationRepository();
