function toISODate(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function calculateNextBillDate(dateOfJoining, billingPattern) {
  var base = new Date(dateOfJoining);
  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid date_of_joining');
  }

  var next = new Date(base.getTime());
  if (billingPattern === 'Weekly') {
    next.setDate(next.getDate() + 7);
  } else if (billingPattern === 'Monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (billingPattern === 'Quarterly') {
    next.setMonth(next.getMonth() + 3);
  } else {
    throw new Error('Invalid billing pattern');
  }

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
};
