const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");

function padId(num) {
  return num.toString().padStart(5, "0");
}
function generateAgentId(num) {
  return `AGT${padId(num)}`;
}

module.exports = (db) => {
  const agents = db.collection("agents");

  router.post("/", authenticateToken, async (req, res) => {
    try {
      const { name, phoneNumber } = req.body;

      if (!name || !phoneNumber) {
        return res.status(400).json({ message: "All fields are required." });
      }

      if (!name.trim().includes(" ")) {
        return res
          .status(400)
          .json({ message: "Please enter a full name with first and last name." });
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
          { $addFields: { agentIdNum: { $toInt: { $substr: ["$agentId", 3, 5] } } } },
          { $sort: { agentIdNum: -1 } },
          { $limit: 1 },
        ])
        .toArray();

      const nextId = maxAgent.length > 0 ? maxAgent[0].agentIdNum + 1 : 1;
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
      return res.status(201).json({ message: "Agent added successfully", agent: newAgent });
    } catch (error) {
      console.error("Error adding agent:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
