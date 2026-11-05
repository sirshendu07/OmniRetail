import { locationService } from './location.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export class LocationController {
  async createLocation(req, res) {
    const location = await locationService.registerLocation(req.body);
    return sendCreated(res, 'Location registered successfully', location);
  }

  async getLocations(req, res) {
    const locations = await locationService.getAllLocations(req.query);
    return sendSuccess(res, 'Locations retrieved successfully', locations);
  }

  async getNearest(req, res) {
    const { lng, lat, maxDistance, limit } = req.query;
    const locations = await locationService.getNearestFulfillmentLocations(
      Number(lng),
      Number(lat),
      Number(maxDistance),
      Number(limit)
    );
    return sendSuccess(res, 'Nearest locations retrieved successfully', locations);
  }
}

export const locationController = new LocationController();
