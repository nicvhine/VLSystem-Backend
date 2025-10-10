const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");

module.exports = (db) => {
  const agents = db.collection("agents");

  router.put("/:agentId", authenticateToken, async (req, res) => {
    try {
      const { agentId } = req.params;
      const { name, phoneNumber } = req.body;

      const updateFields = {};
      if (name) updateFields.name = name.trim();
      if (phoneNumber) updateFields.phoneNumber = phoneNumber.trim();

      const result = await agents.updateOne(
        { agentId },
        { $set: updateFields }
      );

      if (result.matchedCount === 0)
        return res.status(404).json({ message: "Agent not found" });

      return res.status(200).json({ message: "Agent updated successfully" });
    } catch (error) {
      console.error("Error updating agent:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
