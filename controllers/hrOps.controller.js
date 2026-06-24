const catchAsync = require('../middleware/catchAsync');
const { AppError } = require('../middleware/errorHandler');
const RateCardModel = require('../models/rateCard.model');
const { listHrClients, listHrEmployees } = require('../services/hrOps.service');
const {
  CLIENT_LINKS,
  findLinkByBillingAbbreviation,
  employeeMatchesLink,
} = require('../config/hrOpsClientMap');

function normCode(value) {
  return String(value || '').trim().toUpperCase();
}

// Active rate cards in Billing Gen, plus a quick emp_code lookup.
async function loadRateCards() {
  const cards = (await RateCardModel.findAll()) || [];
  const byCode = new Map();
  const codes = new Set();
  for (const card of cards) {
    const key = normCode(card.emp_code);
    codes.add(key);
    if (!byCode.has(key)) byCode.set(key, card);
  }
  return { cards, byCode, codes };
}

// Fetch each linked HR Ops client's employees once (SGTC is shared by two links).
async function loadHrEmployeesByClient() {
  const uniqueHrClients = [...new Set(CLIENT_LINKS.map((l) => l.hrClient))];
  const byClient = {};
  await Promise.all(
    uniqueHrClients.map(async (name) => {
      try {
        byClient[name] = await listHrEmployees(name);
      } catch {
        byClient[name] = null; // unreachable — handled per caller
      }
    }),
  );
  return byClient;
}

const hrOpsController = {
  // GET /api/rate-cards/hr-ops/clients
  // Clients for the autofill picker: linked (mapped) ones + HR Ops clients not in Billing Gen.
  clients: catchAsync(async (req, res) => {
    const hrClients = await listHrClients();
    const hrNames = new Set(hrClients.map((c) => String(c.name || '').toLowerCase()));
    const linkedHrNames = new Set(CLIENT_LINKS.map((l) => l.hrClient.toLowerCase()));

    const linked = CLIENT_LINKS.map((l) => ({
      billingAbbreviation: l.billingAbbreviation,
      hrClient: l.hrClient,
      location: l.location,
      available: hrNames.has(l.hrClient.toLowerCase()),
    }));

    const unlinked = hrClients
      .filter((c) => !linkedHrNames.has(String(c.name || '').toLowerCase()))
      .map((c) => ({ hrClient: c.name }));

    res.json({ success: true, data: { linked, unlinked } });
  }),

  // GET /api/rate-cards/hr-ops/employees?client=<billingAbbreviation>
  // HR Ops employees for the picked client, location-filtered, excluding anyone
  // who already has a rate card in Billing Gen.
  employees: catchAsync(async (req, res) => {
    const billingAbbreviation = String(req.query.client || '').trim();
    const link = findLinkByBillingAbbreviation(billingAbbreviation);
    if (!link) throw new AppError(400, 'That client is not linked to HR Ops.');

    const [hrEmployees, rateCards] = await Promise.all([
      listHrEmployees(link.hrClient),
      loadRateCards(),
    ]);

    const employees = hrEmployees
      .filter((e) => employeeMatchesLink(link, e.location))
      .filter((e) => e.active !== false)
      .filter((e) => !rateCards.codes.has(normCode(e.code)))
      .map((e) => ({
        emp_code: e.code,
        emp_name: e.name,
        doj: e.doj,
        reporting_manager: e.reporting_manager,
        location: e.location,
        designation: e.designation,
      }));

    res.json({ success: true, data: { client: billingAbbreviation, total: employees.length, employees } });
  }),

  // GET /api/rate-cards/hr-ops/exits
  // Employees whose HR Ops record has an LWD / is inactive, but who still have an
  // active rate card in Billing Gen — candidates to stop billing. Powers the dashboard.
  exits: catchAsync(async (req, res) => {
    const { byCode } = await loadRateCards();
    const employeesByClient = await loadHrEmployeesByClient();

    const exits = [];
    for (const link of CLIENT_LINKS) {
      const hrEmployees = employeesByClient[link.hrClient];
      if (!Array.isArray(hrEmployees)) continue; // unreachable client — skip, don't fail the list
      for (const e of hrEmployees) {
        if (!employeeMatchesLink(link, e.location)) continue;
        const hasExited = Boolean(e.lwd) || e.active === false;
        if (!hasExited) continue;
        const card = byCode.get(normCode(e.code));
        if (!card) continue; // no rate card to stop
        exits.push({
          emp_code: e.code,
          emp_name: e.name,
          client: link.billingAbbreviation,
          lwd: e.lwd || null,
          active: e.active,
          rate_card_id: card.id,
          billing_client_name: card.client_name,
          already_disabled: Boolean(card.disable_billing),
        });
      }
    }

    exits.sort((a, b) => String(b.lwd || '').localeCompare(String(a.lwd || '')));
    res.json({ success: true, data: { exits } });
  }),
};

module.exports = hrOpsController;
