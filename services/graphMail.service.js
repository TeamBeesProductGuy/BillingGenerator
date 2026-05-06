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

function formatBillingMonth(value) {
  const raw = String(value || '').trim();
  if (/^\d{6}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = parseInt(raw.slice(4, 6), 10) - 1;
    return new Date(Number(year), month, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }
  return raw || '-';
}

function formatDisplayName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.indexOf('@') === -1) return raw;
  return raw.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function buildManagerSummaryTable(rows, billingMonth) {
  const border = '#1f2937';
  const headerBg = '#F4B740';
  const headerText = '#111111';
  const cellBg = '#ffffff';
  const cellPad = '10px 12px';
  const showHours = rows.some((item) => item && item.billing_method === 'sgtc_hours');

  const headerCells = [
    '<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">S.No.</th>',
    '<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">Service Descriptions</th>',
    '<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">Manager\'s Name</th>',
  ];

  if (showHours) {
    headerCells.push('<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">Billable Hours</th>');
  }

  headerCells.push('<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">Service month</th>');
  headerCells.push('<th style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + headerBg + ';color:' + headerText + ';font-weight:700;">Service billable Amount (INR)</th>');

  const bodyRows = rows.map((item, index) => {
    const hours = item.billing_method === 'sgtc_hours' && item.billing_hours !== null && item.billing_hours !== undefined ? item.billing_hours : '-';
    const cols = [
      '<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + cellBg + ';">' + (index + 1) + '</td>',
      '<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:left;background:' + cellBg + ';white-space:pre-line;">' + escapeHtml(item.service_description_html || '') + '</td>',
      '<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + cellBg + ';">' + escapeHtml(item.reporting_manager || 'Unassigned') + '</td>',
    ];
    if (showHours) {
      cols.push('<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + cellBg + ';">' + escapeHtml(String(hours)) + '</td>');
    }
    cols.push('<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:center;background:' + cellBg + ';">' + escapeHtml(formatBillingMonth(billingMonth)) + '</td>');
    cols.push('<td style="border:1px solid ' + border + ';padding:' + cellPad + ';text-align:right;background:' + cellBg + ';">' + escapeHtml(formatCurrency(item.invoice_amount || 0)) + '</td>');
    return '<tr>' + cols.join('') + '</tr>';
  }).join('');

  return '<table style="width:100%;border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;">' +
    '<thead><tr>' + headerCells.join('') + '</tr></thead>' +
    '<tbody>' + bodyRows + '</tbody></table>';
}

async function createDraftMessage(message) {
  ensureConfigured();
  const token = await getAccessToken();
  const payload = {
    subject: message.subject,
    body: {
      contentType: 'HTML',
      content: message.htmlBody,
    },
    toRecipients: recipientObjects(splitRecipients(message.to)),
    ccRecipients: recipientObjects(splitRecipients(message.cc)),
  };

  const response = await globalThis.fetch(`${GRAPH_BASE_URL}/users/${encodeURIComponent(env.msSenderUpn)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error((data && data.error && data.error.message) || 'Microsoft Graph draft creation failed');
  }

  const webLink = data.webLink || '';
  const editWebLink = webLink
    ? webLink.replace('viewmodel=ReadMessageItem', 'viewmodel=EditMessageItem')
    : '';
  const composeUrl = editWebLink || webLink || (data.id
    ? `https://outlook.office.com/mail/deeplink/compose/${encodeURIComponent(data.id)}?ItemID=${encodeURIComponent(data.id)}&exvsurl=1`
    : '');

  return {
    id: data.id,
    webLink,
    composeUrl: composeUrl || webLink,
  };
}

async function createManagerApprovalDraft(options) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const billingMonthLabel = formatBillingMonth(options.billingMonth);
  const managerName = String(options.reportingManager || 'Manager').trim() || 'Manager';
  const userName = formatDisplayName(options.userName) || formatDisplayName(options.userEmail) || 'Team';
  const subject = `Attendance Sheet and Service Request for ${billingMonthLabel}`;
  const tableHtml = buildManagerSummaryTable(rows, options.billingMonth);
  const htmlBody = [
    `<p>Hi ${escapeHtml(managerName)},</p>`,
    `<p>Please find below the Attendance Sheet and Service Request for the month of <strong>${escapeHtml(billingMonthLabel)}</strong>.</p>`,
    '<p>Kindly review the details and provide your approval.</p>',
    '<br/>',
    tableHtml,
    '<br/>',
    `<p>Regards,<br/>${escapeHtml(userName)}</p>`,
  ].join('');

  const draft = await createDraftMessage({
    subject,
    htmlBody,
    to: options.to,
    cc: options.cc,
  });

  return {
    ...draft,
    subject,
  };
}

module.exports = {
  getAccessToken,
  sendPaymentReminderEmail,
  createManagerApprovalDraft,
};
