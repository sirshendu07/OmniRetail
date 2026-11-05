import { transferService } from './transfer.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';

export class TransferController {
  async requestTransfer(req, res) {
    const transfer = await transferService.requestTransfer({
      fromLocationId: req.body.fromLocationId,
      toLocationId: req.body.toLocationId,
      items: req.body.items,
      userId: req.user._id
    });
    return sendCreated(res, 'Stock transfer requested successfully', transfer);
  }

  async dispatchTransfer(req, res) {
    const transfer = await transferService.dispatchTransfer(req.params.transferId);
    return sendSuccess(res, 'Stock transfer dispatched in transit', transfer);
  }

  async receiveTransfer(req, res) {
    const transfer = await transferService.receiveTransfer(req.params.transferId, req.user._id);
    return sendSuccess(res, 'Stock transfer received and added to inventory', transfer);
  }

  async listTransfers(req, res) {
    const transfers = await transferService.listTransfers(req.query);
    return sendSuccess(res, 'Transfers retrieved successfully', transfers);
  }
}

export const transferController = new TransferController();
