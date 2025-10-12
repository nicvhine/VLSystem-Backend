const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");

module.exports = (db) => {
  const agents = db.collection("agents");
  const applications = db.collection("loan_applications");
  
  router.get('/names', async (req, res) => {
    try {
      const agents = await db.collection('agents')
        .find({}, { projection: { _id: 0, agentId: 1, name: 1 } })
        .toArray();
  
      res.json({ agents }); 
    } catch (err) {
      console.error('Error fetching agents:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  
  // Get all agents with loan stats
  router.get("/", authenticateToken, authorizeRole("head", "manager", "loan officer"), async (req, res) => {
    try {
      const allAgents = await agents.find().toArray();

      for (const agent of allAgents) {
        const assignedApplications = await applications
          .find({ "appAgent.id": agent.agentId, status: "Disbursed" })
          .toArray();

        if (assignedApplications.length > 0) {
          const totalLoanAmount = assignedApplications.reduce(
            (sum, app) => sum + (app.appLoanAmount || 0),
            0
          );
          const totalCommission = totalLoanAmount * 0.05;
          const handledLoans = assignedApplications.length;

          await agents.updateOne(
            { agentId: agent.agentId },
            { $set: { handledLoans, totalLoanAmount, totalCommission } }
          );

          agent.handledLoans = handledLoans;
          agent.totalLoanAmount = totalLoanAmount;
          agent.totalCommission = totalCommission;
        }
      }

      return res.status(200).json({ agents: allAgents });
    } catch (error) {
      console.error("Error fetching agents:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  //  Get specific agent details
  router.get("/:agentId", authenticateToken, authorizeRole("head", "manager", "loan officer"), async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await agents.findOne({ agentId });

      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const assignedApplications = await applications
        .find({ "appAgent.id": agentId, status: "Disbursed" })
        .toArray();

      const totalLoanAmount = assignedApplications.reduce(
        (sum, app) => sum + (app.appLoanAmount || 0),
        0
      );

      const totalCommission = totalLoanAmount * 0.05;
      const handledLoans = assignedApplications.length;

      await agents.updateOne(
        { agentId },
        { $set: { handledLoans, totalLoanAmount, totalCommission } }
      );

      agent.handledLoans = handledLoans;
      agent.totalLoanAmount = totalLoanAmount;
      agent.totalCommission = totalCommission;

      return res.status(200).json({ agent });
    } catch (error) {
      console.error("Error fetching agent:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
