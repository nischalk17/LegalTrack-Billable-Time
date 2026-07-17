const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Notifies a lawyer that a draft bill was auto-generated and needs review.
 * Fails soft: a mail-provider outage or missing config must never break bill generation.
 */
async function sendDraftBillReadyEmail({ to, clientName, billNumber, totalNpr, billUrl }) {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn('Mailer not configured (RESEND_API_KEY/EMAIL_FROM missing); skipping email to', to);
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: `Draft invoice ready for ${clientName} — ${billNumber}`,
      html: `
        <p>A draft invoice was automatically generated from unbilled time.</p>
        <ul>
          <li><strong>Client:</strong> ${clientName}</li>
          <li><strong>Bill number:</strong> ${billNumber}</li>
          <li><strong>Total:</strong> Rs. ${totalNpr.toLocaleString('en-IN')}</li>
        </ul>
        <p><a href="${billUrl}">Review and send this invoice</a></p>
      `,
    });
  } catch (err) {
    console.error('Failed to send draft bill email:', err.message);
  }
}

/**
 * Notifies an existing user they've been added to an organization.
 * Fails soft, same as sendDraftBillReadyEmail.
 */
async function sendOrganizationInviteEmail({ to, inviteeName, organizationName, role }) {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn('Mailer not configured (RESEND_API_KEY/EMAIL_FROM missing); skipping email to', to);
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: `You've been added to ${organizationName} on LegalTrack`,
      html: `
        <p>Hi ${inviteeName},</p>
        <p>You've been added to <strong>${organizationName}</strong> as a <strong>${role}</strong>.</p>
        <p>Switch to it from the organization menu in LegalTrack to start collaborating on shared clients and bills.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send organization invite email:', err.message);
  }
}

/**
 * Sends a password-reset OTP. Fails soft, same as the other send functions —
 * the calling route already responds generically regardless of outcome, to
 * avoid leaking whether an account exists for a given email.
 */
async function sendPasswordResetEmail({ to, name, otp }) {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn('Mailer not configured (RESEND_API_KEY/EMAIL_FROM missing); skipping email to', to);
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: 'Your LegalTrack password reset code',
      html: `
        <p>Hi ${name},</p>
        <p>Use this code to reset your password. It expires in 10 minutes.</p>
        <p style="font-size:28px;font-weight:600;letter-spacing:4px;">${otp}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
  }
}

module.exports = { sendDraftBillReadyEmail, sendOrganizationInviteEmail, sendPasswordResetEmail };
