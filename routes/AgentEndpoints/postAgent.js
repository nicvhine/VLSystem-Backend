const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { createAgent } = require("../../Services/agentService");
const agentRepository = require("../../Repositories/agentRepository");

module.exports = (db) => {
  const repo = agentRepository(db);

  router.post("/", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    try {
      const newAgent = await createAgent(req.body, repo, db);
      res.status(201).json({ message: "Agent added successfully", agent: newAgent });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  return router;
};
