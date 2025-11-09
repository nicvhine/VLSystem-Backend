const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const agentRepository = require("../../repositories/agentRepository");
const agentService = require("../../services/agentService");

// Read agent names, list, and details
module.exports = (db) => {
  const repo = agentRepository(db);

  // Get agent names 
  router.get("/names", async (req, res) => {
    try {
      const agents = await repo.getAgentNames();
      res.json({ agents });
    } catch (err) {
      console.error("Error fetching agents:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all agents with computed stats
  router.get("/", authenticateToken, authorizeRole("head", "manager", "loan officer"), async (req, res) => {
    try {
      const agents = await agentService.getAllAgentsWithStats(repo);
      res.status(200).json({ agents });
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get one agent by ID
  router.get("/:agentId", authenticateToken, authorizeRole("head", "manager", "loan officer"), async (req, res) => {
    try {
      const agent = await agentService.getAgentDetails(req.params.agentId, repo);
      res.status(200).json({ agent });
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(404).json({ message: error.message });
    }
  });

  return router;
};
