import { fulfillmentService } from './fulfillment.service.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';

export class FulfillmentController {
  async resolveSource(req, res) {
    const { lng, lat, items } = req.body;
    const source = await fulfillmentService.resolveOptimalFulfillmentSource({
      coordinates: [Number(lng), Number(lat)],
      items
    });
    return sendSuccess(res, 'Optimal fulfillment source resolved', source);
  }

  async checkBopis(req, res) {
    const { locationId } = req.params;
    const { items } = req.body;
    const result = await fulfillmentService.checkBopisEligibility(locationId, items);
    return sendSuccess(res, 'BOPIS store availability evaluated', result);
  }
}

export const fulfillmentController = new FulfillmentController();
