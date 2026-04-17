const env = require('../config/env');
const PermanentReminderModel = require('../models/permanentReminder.model');
const { sendPaymentReminderEmail } = require('./graphMail.service');

let timer = null;
let running = false;

function isConfigured() {
  return Boolean(
    env.msTenantId &&
    env.msClientId &&
    env.msClientSecret &&
    env.msSenderUpn &&
    env.reminderPrimaryRecipients
  );
}

async function dispatchDueReminders() {
  if (running) return;
  running = true;
  let reminders = [];

  try {
    reminders = await PermanentReminderModel.findDueForDispatch(new Date().toISOString());
    if (reminders.length === 0) return;

    await sendPaymentReminderEmail(reminders);
    await PermanentReminderModel.markBatchSent(reminders.map((reminder) => reminder.id));
    console.log(`[reminder-scheduler] Sent ${reminders.length} reminder(s)`);
  } catch (error) {
    console.error('[reminder-scheduler] Failed to send reminders:', error.message);
    try {
      if (reminders.length > 0) {
        await PermanentReminderModel.markBatchFailed(reminders.map((reminder) => reminder.id), error.message);
      }
    } catch (markError) {
      console.error('[reminder-scheduler] Failed to persist reminder error:', markError.message);
    }
  } finally {
    running = false;
  }
}

function start() {
  if (!env.reminderSchedulerEnabled || env.nodeEnv === 'test') return;
  if (timer) return;
  if (!isConfigured()) {
    console.log('[reminder-scheduler] Skipped start because Graph mail environment variables are incomplete');
    return;
  }

  const intervalMs = Math.max(env.reminderFrequencyHours, 1) * 60 * 60 * 1000;
  timer = setInterval(dispatchDueReminders, intervalMs);
  dispatchDueReminders().catch((error) => {
    console.error('[reminder-scheduler] Initial run failed:', error.message);
  });
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop,
  dispatchDueReminders,
};
