const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const { createAgent } = require("../../Services/agentService");

module.exports = (db) => {
  const agentRepo = require("../Repositories/agentRepository")(db);

  router.post("/", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    try {
      const newAgent = await createAgent(req.body, agentRepo);
      res.status(201).json({ message: "Agent added successfully", agent: newAgent });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  return router;
};
