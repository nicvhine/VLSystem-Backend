const { generateAgentIdFromNumber } = require("../utils/generator");

const createAgent = async ({ name, phoneNumber }, agentRepo) => {
  if (!name || !phoneNumber) throw new Error("All fields are required");
  if (!name.trim().includes(" ")) throw new Error("Please enter a full name");

  const existing = await agentRepo.findAgentByNameAndPhone(name, phoneNumber);
  if (existing) throw new Error("Agent with this name and phone number already exists");

  const maxId = await agentRepo.getMaxAgentIdNum(); 
  const agentId = generateAgentIdFromNumber(maxId + 1); 

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

module.exports = { createAgent };
