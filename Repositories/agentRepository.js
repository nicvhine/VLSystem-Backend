module.exports = (db) => {
  const agents = db.collection("agents");
  const applications = db.collection("loan_applications");

  return {
    // ─── GET METHODS
    async getAllAgents() {
      return await agents.find().toArray();
    },

    async getAgentById(agentId) {
      return await agents.findOne({ agentId });
    },

    async getAgentNames() {
      return await agents
        .find({}, { projection: { _id: 0, agentId: 1, name: 1 } })
        .toArray();
    },

    async getAssignedApplications(agentId) {
      return await applications
        .find({ "appAgent.id": agentId, status: "Disbursed" })
        .toArray();
    },

    async updateAgentStats(agentId, stats) {
      await agents.updateOne({ agentId }, { $set: stats });
    },

    // ─── CREATE & VALIDATION METHODS 
    async findAgentByNameAndPhone(name, phoneNumber) {
      return await agents.findOne({
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
      });
    },

    async getMaxAgentIdNum() {
      const result = await agents
        .aggregate([
          {
            $addFields: {
              agentIdNum: { $toInt: { $substr: ["$agentId", 3, 5] } },
            },
          },
          { $sort: { agentIdNum: -1 } },
          { $limit: 1 },
        ])
        .toArray();

      return result.length > 0 ? result[0].agentIdNum : 0;
    },

    async insertAgent(agent) {
      return await agents.insertOne(agent);
    },
  };
};
