// Links a Billing Gen client (identified by its abbreviation) to an HR Ops (HR1)
// client + an optional location filter. Billing Gen splits some clients by
// location (SGTC BLR / SGTC GGN) while HR Ops keeps one client with a per-employee
// location, so the location token routes employees to the right Billing Gen client.
//
// Extend this list when new clients are linked. `location: null` means "all
// locations for that HR Ops client".
const CLIENT_LINKS = [
  { billingAbbreviation: 'Vocera BLR', hrClient: 'Vocera', location: null },
  { billingAbbreviation: 'SGTC BLR', hrClient: 'SGTC', location: 'bangalore' },
  { billingAbbreviation: 'SGTC GGN', hrClient: 'SGTC', location: 'gurugram' },
];

// Normalize a location string to a canonical token so "Gurgaon" and "Gurugram"
// (and "Bangalore"/"Bengaluru") match the same Billing Gen client.
function normalizeLocation(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('gurgaon') || text.includes('gurugram') || text.includes('ggn')) return 'gurugram';
  if (text.includes('bangalore') || text.includes('bengaluru') || text.includes('blr')) return 'bangalore';
  return text.trim();
}

function findLinkByBillingAbbreviation(abbreviation) {
  const key = String(abbreviation || '').trim().toLowerCase();
  return CLIENT_LINKS.find((link) => link.billingAbbreviation.toLowerCase() === key) || null;
}

// Does an HR Ops employee's location belong to this link? (null location = any)
function employeeMatchesLink(link, employeeLocation) {
  if (!link.location) return true;
  return normalizeLocation(employeeLocation) === normalizeLocation(link.location);
}

module.exports = {
  CLIENT_LINKS,
  normalizeLocation,
  findLinkByBillingAbbreviation,
  employeeMatchesLink,
};
