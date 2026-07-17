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

module.exports = { sendDraftBillReadyEmail };
