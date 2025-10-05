const express = require("express");
const router = express.Router();

function padId(num) {
  return num.toString().padStart(5, "0");
}

function generateAgentId(num) {
  return `AGT${padId(num)}`;
}

module.exports = (db) => {
  const agents = db.collection("agents");
  const applications = db.collection("loan-applications"); 

  router.post("/", async (req, res) => {
    try {
      const { name, phoneNumber } = req.body;

      if (!name || !phoneNumber) {
        return res.status(400).json({ message: "All fields are required." });
      }

      if (!name.trim().includes(" ")) {
        return res.status(400).json({
          message: "Please enter a full name with first and last name.",
        });
      }

      const existingAgent = await agents.findOne({
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
      });

      if (existingAgent) {
        return res
          .status(400)
          .json({ message: "Agent with this name and phone number already exists." });
      }

      const maxAgent = await agents
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

      let nextId = 1;
      if (maxAgent.length > 0 && !isNaN(maxAgent[0].agentIdNum)) {
        nextId = maxAgent[0].agentIdNum + 1;
      }

      const agentId = generateAgentId(nextId);

      const newAgent = {
        agentId,
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        handledLoans: 0,
        totalLoanAmount: 0,
        totalCommission: 0,
        createdAt: new Date(),
      };

      await agents.insertOne(newAgent);

      return res
        .status(201)
        .json({ message: "Agent added successfully", agent: newAgent });
    } catch (error) {
      console.error("Error adding agent:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  router.get("/", async (req, res) => {
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

  // 📌 Get a specific agent
  router.get("/:agentId", async (req, res) => {
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

  router.delete("/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const result = await agents.deleteOne({ agentId });

      if (result.deletedCount === 0)
        return res.status(404).json({ message: "Agent not found" });

      return res.status(200).json({ message: "Agent deleted successfully" });
    } catch (error) {
      console.error("Error deleting agent:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
