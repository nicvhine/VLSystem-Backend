const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const agentRepository = require("../../repositories/agentRepository");
const agentService = require("../../services/agentService");
const { decrypt } = require("../../utils/crypt");

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
  router.get("/:agentId/loans", authenticateToken, authorizeRole("head", "manager", "loan officer"), async (req, res) => {
    const { agentId } = req.params;
    try {
      const repo = agentRepository(db);
      const loans = await repo.getAssignedApplications(agentId);

      // Decrypt each loan's appName
      const decryptedLoans = loans.map(loan => ({
        ...loan,
        appName: decrypt(loan.appName)
      }));

      res.json({ loans: decryptedLoans }); 
    } catch (err) {
      console.error("Failed to fetch agent loans", err);
      res.status(500).json({ loans: [] });
    }
  });

  return router;
};
