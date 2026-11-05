import nodemailer from 'nodemailer';
import { env } from '../../config/env.config.js';
import { logger } from '../../common/utils/logger.js';

let transporter = null;

/**
 * Creates or retrieves the singleton Nodemailer SMTP transporter.
 */
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE,
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_APP_PASSWORD
      },
      pool: true,
      maxConnections: 5,
      rateLimit: 10 // max 10 emails per second
    });
  }
  return transporter;
}

/**
 * Sends an email with retry logic for transient SMTP failures.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Subject line
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<{ messageId: string }>}
 */
export async function sendEmail({ to, subject, html, text }, retries = 2) {
  if (process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test' || !env.EMAIL_USER || !env.EMAIL_APP_PASSWORD) {
    logger.debug({ to, subject }, 'Simulating email dispatch in test/mock environment');
    return { messageId: 'simulated-mail-id' };
  }

  const client = getTransporter();
  try {
    const info = await client.sendMail({
      from: `"OmniRetail" <${env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text
    });
    logger.info({ messageId: info.messageId, to }, 'Email dispatched successfully');
    return info;
  } catch (err) {
    if (retries > 0) {
      logger.warn({ err: err.message, to, retriesLeft: retries - 1 }, 'SMTP delivery failure. Retrying...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return sendEmail({ to, subject, html, text }, retries - 1);
    }
    logger.error({ err: err.message, to }, 'Fatal email delivery failure after retries');
    throw err;
  }
}
