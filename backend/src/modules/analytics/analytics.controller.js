import { analyticsService } from './analytics.service.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';

export class AnalyticsController {
  async getStoreSales(req, res) {
    const { startDate, endDate } = req.query;
    const metrics = await analyticsService.getStoreSalesMetrics(startDate, endDate);
    return sendSuccess(res, 'Store sales performance metrics retrieved', metrics);
  }

  async getInventoryHealth(_req, res) {
    const metrics = await analyticsService.getInventoryHealthMetrics();
    return sendSuccess(res, 'Inventory health & stockout metrics retrieved', metrics);
  }

  async getChannelSplit(_req, res) {
    const metrics = await analyticsService.getChannelSplitMetrics();
    return sendSuccess(res, 'Omnichannel fulfillment channel split metrics retrieved', metrics);
  }
}

export const analyticsController = new AnalyticsController();
