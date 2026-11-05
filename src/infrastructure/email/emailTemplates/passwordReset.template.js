/**
 * HTML and text email templates for password reset OTP.
 * @param {Object} data
 * @param {string} data.firstName
 * @param {string} data.otp
 * @param {number} [data.expiryMinutes=5]
 * @returns {{ subject: string, html: string, text: string }}
 */
export function getPasswordResetTemplate({ firstName, otp, expiryMinutes = 5 }) {
  const subject = `${otp} is your OmniRetail password reset code`;
  const text = `Hello ${firstName},\n\nYou requested a password reset for your OmniRetail account.\nYour reset code is: ${otp}\n\nThis code is valid for ${expiryMinutes} minutes. If you did not make this request, please change your password immediately.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; margin-bottom: 16px;">OmniRetail Password Reset</h2>
      <p style="color: #475569; font-size: 16px;">Hello <strong>${firstName}</strong>,</p>
      <p style="color: #475569; font-size: 16px;">We received a request to reset your password. Use the code below to proceed:</p>
      <div style="background-color: #fef2f2; border: 2px dashed #dc2626; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626; border-radius: 6px; margin: 24px 0;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 14px;">This code will expire in <strong>${expiryMinutes} minutes</strong>. If you did not request this, please contact support.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">OmniRetail Security Team</p>
    </div>
  `;

  return { subject, html, text };
}
