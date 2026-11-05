/**
 * HTML and text email templates for user email verification OTP.
 * @param {Object} data
 * @param {string} data.firstName
 * @param {string} data.otp
 * @param {number} [data.expiryMinutes=5]
 * @returns {{ subject: string, html: string, text: string }}
 */
export function getOtpEmailTemplate({ firstName, otp, expiryMinutes = 5 }) {
  const subject = `${otp} is your OmniRetail verification code`;
  const text = `Hello ${firstName},\n\nYour OmniRetail verification code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes. If you did not request this, please ignore this email.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0071dc; margin-bottom: 16px;">OmniRetail Verification</h2>
      <p style="color: #475569; font-size: 16px;">Hello <strong>${firstName}</strong>,</p>
      <p style="color: #475569; font-size: 16px;">Please use the following 6-digit one-time password (OTP) to verify your email address:</p>
      <div style="background-color: #f8fafc; border: 2px dashed #0071dc; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0071dc; border-radius: 6px; margin: 24px 0;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 14px;">This code will expire in <strong>${expiryMinutes} minutes</strong>. For your security, never share this code with anyone.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">OmniRetail Intelligent Omnichannel Commerce Platform</p>
    </div>
  `;

  return { subject, html, text };
}
