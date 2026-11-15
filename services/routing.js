const Institution = require('../Models/institutionModel');
const Rule = require('../Models/routingRuleModel');
async function resolveRouting(payload) {
  // Deterministic priority: exact pair, branch, scheme, explicit default.
  for (const [loanId, branchId] of [[payload.loanId, payload.branchId], ['*', payload.branchId], [payload.loanId, '*'], ['*', '*']]) {
    const rule = await Rule.findOne({ loanId, branchId });
    if (!rule) continue;
    const institution = await Institution.findOne({ _id: rule.institutionId, active: true });
    if (!institution) continue;
    return { institutionId: institution._id, notificationRecipient: institution.notificationEmail };
  }
  return { institutionId: null };
}
module.exports = { resolveRouting };
