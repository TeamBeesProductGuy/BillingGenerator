function toISODate(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getInvoiceDueDays(billingPattern) {
  if (billingPattern === 'Immediate') return 0;
  if (billingPattern === '7 days' || billingPattern === 'Weekly') return 7;
  if (billingPattern === '30 days' || billingPattern === 'Monthly') return 30;
  if (billingPattern === '60 days') return 60;
  if (billingPattern === '90 days' || billingPattern === 'Quarterly') return 90;
  throw new Error('Invalid invoice due setting');
}

function calculateNextBillDate(dateOfJoining, billingPattern) {
  var base = new Date(dateOfJoining);
  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid date_of_joining');
  }

  var next = new Date(base.getTime());
  next.setDate(next.getDate() + getInvoiceDueDays(billingPattern));

  return toISODate(next);
}

function calculateBillAmount(ctcOffered, billingRate) {
  var ctc = Number(ctcOffered || 0);
  var rate = Number(billingRate || 0);
  var amount = ctc * (rate / 100);
  return Number(amount.toFixed(2));
}

module.exports = {
  calculateNextBillDate,
  calculateBillAmount,
  getInvoiceDueDays,
};
