const env = require('../config/env');

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

function ensureConfigured() {
  if (!env.msTenantId || !env.msClientId || !env.msClientSecret || !env.msSenderUpn) {
    throw new Error('Microsoft Graph mail settings are missing in environment');
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime');
  }
}

function splitRecipients(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function recipientObjects(addresses) {
  return addresses.map((address) => ({
    emailAddress: { address },
  }));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getDaysOverdue(dueDate) {
  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)));
}

function resolveRecipients() {
  const to = splitRecipients(env.reminderPrimaryRecipients);
  const secondary = splitRecipients(env.reminderSecondaryRecipients);

  if (to.length === 0) {
    throw new Error('Primary reminder recipients are missing in environment');
  }

  return {
    toRecipients: recipientObjects(to),
    ccRecipients: env.reminderSecondaryMode.toLowerCase() === 'cc' ? recipientObjects(secondary) : [],
    extraToRecipients: env.reminderSecondaryMode.toLowerCase() === 'to' ? recipientObjects(secondary) : [],
  };
}

function buildReminderEmail(reminders) {
  const brandPrimary = '#F4B740';
  const brandAccent = '#E39A1C';
  const brandSecondary = '#2B2B2B';
  const brandBackground = '#FFFDF8';
  const brandSurface = '#FFFFFF';
  const brandMuted = '#F5F5F5';
  const brandBorder = '#E5E5E5';

  const rows = reminders.map((reminder) => {
    const clientName = reminder.client && reminder.client.client_name ? reminder.client.client_name : '-';
    const order = reminder.order || {};
    const dueDate = reminder.due_date;

    return `
      <tr>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(clientName)}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(order.requisition_description || '')}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(order.candidate_name || '')}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(order.position_role || '')}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(formatDate(order.date_of_offer || ''))}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};">${escapeHtml(formatDate(order.date_of_joining || ''))}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};text-align:right;">${escapeHtml(formatCurrency(order.ctc_offered || 0))}</td>
        <td style="padding:12px 14px;border:1px solid ${brandBorder};text-align:right;">${escapeHtml(formatCurrency(order.bill_amount || 0))}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="margin:0;padding:24px;background:${brandBackground};font-family:Segoe UI,Arial,sans-serif;color:${brandSecondary};">
      <div style="max-width:920px;margin:0 auto;background:${brandSurface};border:1px solid ${brandBorder};border-radius:16px;overflow:hidden;box-shadow:0 18px 48px rgba(43,43,43,0.08);">
        <div style="padding:24px 28px;background:linear-gradient(135deg, ${brandPrimary}, ${brandAccent});color:#ffffff;">
          <h2 style="margin:0;font-size:22px;font-weight:700;">Invoice for ${escapeHtml(reminders[0] && reminders[0].client && reminders[0].client.client_name ? reminders[0].client.client_name : 'Client')}</h2>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;line-height:1.6;">Please create the invoice to <strong>${escapeHtml(reminders[0] && reminders[0].client && reminders[0].client.client_name ? reminders[0].client.client_name : 'the client')}</strong> as per following data:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:${brandMuted};">
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Client Name</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Requisition / Description</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Candidate Name</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Role</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Date of Offer</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:left;">Date of Joining</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:right;">CTC</th>
                <th style="padding:12px 14px;border:1px solid ${brandBorder};text-align:right;">Invoice Value</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin:20px 0 0;line-height:1.6;">Please share the billing confirmation once the invoice has been created.</p>
          <p style="margin:20px 0 0;line-height:1.6;">This is an automated email, please do not reply.</p>
        </div>
      </div>
    </div>
  `;
}

async function getAccessToken() {
  ensureConfigured();

  const response = await globalThis.fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.msTenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new globalThis.URLSearchParams({
      client_id: env.msClientId,
      client_secret: env.msClientSecret,
      scope: env.msGraphScope,
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Unable to get Microsoft Graph access token');
  }

  return data.access_token;
}

async function sendPaymentReminderEmail(reminders) {
  if (!Array.isArray(reminders) || reminders.length === 0) {
    throw new Error('No reminders provided for email');
  }

  const token = await getAccessToken();
  const recipients = resolveRecipients();
  const payload = {
    message: {
      subject: `Invoice for ${reminders[0] && reminders[0].client && reminders[0].client.client_name ? reminders[0].client.client_name : 'Client'}`,
      body: {
        contentType: 'HTML',
        content: buildReminderEmail(reminders),
      },
      toRecipients: recipients.toRecipients.concat(recipients.extraToRecipients),
      ccRecipients: recipients.ccRecipients,
    },
    saveToSentItems: env.reminderSaveToSentItems,
  };

  const response = await globalThis.fetch(`${GRAPH_BASE_URL}/users/${encodeURIComponent(env.msSenderUpn)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMessage = 'Microsoft Graph sendMail failed';
    try {
      const data = await response.json();
      errorMessage = data.error && data.error.message ? data.error.message : errorMessage;
    } catch {
      // Ignore JSON parse failure and use default error.
    }
    throw new Error(errorMessage);
  }

  return { accepted: true };
}

module.exports = {
  getAccessToken,
  sendPaymentReminderEmail,
};
