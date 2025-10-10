const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");

module.exports = (db) => {
  const agents = db.collection("agents");

  router.delete("/:agentId", authenticateToken, async (req, res) => {
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
