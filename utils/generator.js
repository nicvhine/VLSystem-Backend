const padId = (num) => num.toString().padStart(5, "0");

async function generateAgentId(db) {
  const lastAgent = await db.collection("agents")
    .find({})
    .sort({ agentId: -1 })
    .limit(1)
    .toArray();

  let nextNumber = 1;
  if (lastAgent.length > 0) {
    const lastId = lastAgent[0].agentId;
    const idString = typeof lastId === "string" ? lastId : String(lastId ?? "");
    const sanitized = idString.replace(/[^0-9]/g, "");
    const numPart = parseInt(sanitized, 10);
    if (!Number.isNaN(numPart)) nextNumber = numPart + 1;
  }

  return `AGT${padId(nextNumber)}`;
}

async function generateApplicationId(loanApplications) {
  const lastApplication = await loanApplications
    .find({})
    .sort({ applicationId: -1 })
    .limit(1)
    .toArray();

  let nextNumber = 1;
  if (lastApplication.length > 0) {
    const lastId = lastApplication[0].applicationId;
    const numPart = parseInt(lastId.replace("APL", ""), 10);
    if (!isNaN(numPart)) nextNumber = numPart + 1;
  }

  return `APL${padId(nextNumber)}`;
}

async function generateBorrowerId(borrowersCollection) {
  const lastBorrower = await borrowersCollection
    .find({})
    .sort({ borrowersId: -1 })
    .limit(1)
    .toArray();

  let nextNumber = 1;
  if (lastBorrower.length > 0) {
    const lastId = lastBorrower[0].borrowersId;
    const numPart = parseInt(lastId.replace("BWR", ""), 10);
    if (!isNaN(numPart)) nextNumber = numPart + 1;
  }

  return `B${padId(nextNumber)}`;
}

module.exports = { padId, generateAgentId, generateApplicationId, generateBorrowerId };
