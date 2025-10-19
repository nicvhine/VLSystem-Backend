const { generateAgentId } = require("../Utils/generator");

// Compute aggregated loan stats for an agent
const calculateStats = (applications) => {
  const totalLoanAmount = applications.reduce(
    (sum, app) => sum + (app.appLoanAmount || 0),
    0
  );

  return {
    handledLoans: applications.length,
    totalLoanAmount,
    totalCommission: totalLoanAmount * 0.05,
  };
};

// Create a new agent with generated id
const createAgent = async ({ name, phoneNumber }, agentRepo, db) => {
  if (!name || !phoneNumber) throw new Error("All fields are required");
  if (!name.trim().includes(" ")) throw new Error("Please enter a full name");

  const existing = await agentRepo.findAgentByNameAndPhone(name, phoneNumber);
  if (existing)
    throw new Error("Agent with this name and phone number already exists");

    const agentId = await generateAgentId(db);

  const newAgent = {
    agentId,
    name: name.trim(),
    phoneNumber: phoneNumber.trim(),
    handledLoans: 0,
    totalLoanAmount: 0,
    totalCommission: 0,
    createdAt: new Date(),
  };

  await agentRepo.insertAgent(newAgent);
  return newAgent;
};


// Get all agents and update their computed stats
const getAllAgentsWithStats = async (repo) => {
  const agents = await repo.getAllAgents();

  for (const agent of agents) {
    const assignedApplications = await repo.getAssignedApplications(agent.agentId);
    if (assignedApplications.length > 0) {
      const stats = calculateStats(assignedApplications);
      await repo.updateAgentStats(agent.agentId, stats);
      Object.assign(agent, stats);
    }
  }

  return agents;
};

// Get one agent with computed stats
const getAgentDetails = async (agentId, repo) => {
  const agent = await repo.getAgentById(agentId);
  if (!agent) throw new Error("Agent not found");

  const assignedApplications = await repo.getAssignedApplications(agentId);
  const stats = calculateStats(assignedApplications);

  await repo.updateAgentStats(agentId, stats);
  Object.assign(agent, stats);

  return agent;
};

module.exports = {
  createAgent,
  getAllAgentsWithStats,
  getAgentDetails,
};
