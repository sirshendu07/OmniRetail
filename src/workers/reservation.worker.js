import { reservationRepository } from '../modules/reservations/reservation.repository.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { LEDGER_TYPES } from '../modules/inventory/inventoryLedger.model.js';
import { logger } from '../common/utils/logger.js';

let intervalTimer = null;
let isProcessing = false;

/**
 * Sweeps expired pending reservations and restores available stock.
 */
export async function sweepExpiredReservations() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const expiredList = await reservationRepository.findExpiredPending(50);
    if (expiredList.length === 0) return;

    logger.info({ count: expiredList.length }, 'Found expired reservations. Restoring stock...');
    for (const reservation of expiredList) {
      await inventoryService.releaseReservation(reservation.reservationId, LEDGER_TYPES.RESERVATION_EXPIRED);
      logger.info({ reservationId: reservation.reservationId }, 'Expired reservation restored to stock');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Error in reservation expiration worker cycle');
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the recurring background reservation expiration sweeper.
 * @param {number} intervalMs - Frequency in milliseconds (default: 30 seconds)
 */
export function startReservationWorker(intervalMs = 30000) {
  logger.info({ intervalMs }, 'Starting Reservation Expiration Sweeper Worker');
  intervalTimer = setInterval(sweepExpiredReservations, intervalMs);
}

/**
 * Stops the reservation background sweeper cleanly.
 */
export function stopReservationWorker() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    logger.info('Reservation Expiration Sweeper Worker stopped');
  }
}
