import { Reservation, RESERVATION_STATUS } from './reservation.model.js';

export class ReservationRepository {
  /**
   * Creates a new pending reservation record.
   */
  async createReservation(data, session = null) {
    const [reservation] = await Reservation.create([data], { session });
    return reservation;
  }

  /**
   * Finds reservation by its unique reservationId.
   */
  async findById(reservationId, session = null) {
    return Reservation.findOne({ reservationId }).session(session);
  }

  /**
   * Finds expired reservations still in PENDING status.
   */
  async findExpiredPending(limit = 100) {
    return Reservation.find({
      status: RESERVATION_STATUS.PENDING,
      expiresAt: { $lte: new Date() }
    })
      .limit(limit)
      .lean();
  }

  /**
   * Updates reservation status (e.g. CONFIRMED, EXPIRED, CANCELLED).
   */
  async updateStatus(reservationId, status, session = null) {
    return Reservation.findOneAndUpdate(
      { reservationId },
      { $set: { status } },
      { new: true, session }
    );
  }
}

export const reservationRepository = new ReservationRepository();
