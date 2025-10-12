const padId = (num) => num.toString().padStart(5, "0");

// Generate a new application ID
async function generateApplicationId(loanApplications) {
  const maxApp = await loanApplications
    .aggregate([
      { $addFields: { applicationIdNum: { $toInt: "$applicationId" } } },
      { $sort: { applicationIdNum: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  let nextAppId = 1;
  if (maxApp.length > 0 && !isNaN(maxApp[0].applicationIdNum)) {
    nextAppId = maxApp[0].applicationIdNum + 1;
  }

  return padId(nextAppId);
}

// Generate a new agent ID
async function generateAgentId(agentsCollection) {
  const maxAgent = await agentsCollection
    .aggregate([
      { $addFields: { agentNum: { $toInt: { $substr: ["$agentId", 3, -1] } } } },
      { $sort: { agentNum: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  let nextNum = 1;
  if (maxAgent.length > 0 && !isNaN(maxAgent[0].agentNum)) {
    nextNum = maxAgent[0].agentNum + 1;
  }

  return `AGT${padId(nextNum)}`;
}

module.exports = { padId, generateApplicationId, generateAgentId };
