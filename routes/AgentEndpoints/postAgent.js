const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { createAgent } = require("../../Services/agentService");
const agentRepository = require("../../Repositories/agentRepository");
const logRepository = require("../../repositories/logRepository"); 

// Create a new agent (loan officer only)
module.exports = (db) => {
  const repo = agentRepository(db);
  const logRepo = logRepository(db); 

  router.post("/", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    try {
      const newAgent = await createAgent(req.body, repo, db);

      await logRepo.insertActivityLog({
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        action: "CREATE_AGENT",
        description: `Created new agent: ${newAgent.name} (${newAgent.role})`,
      });
      
      res.status(201).json({ message: "Agent added successfully", agent: newAgent });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  return router;
};
