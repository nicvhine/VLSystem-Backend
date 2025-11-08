const express = require("express");
const router = express.Router();
const { createLoan } = require("../../services/loanService");
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");

module.exports = (db) => {
  router.post("/generate-loan/:applicationId", authenticateToken, authorizeRole("manager"), async (req, res) => {
    const { applicationId } = req.params;

    try {
      const loan = await createLoan(applicationId, db);
      res.status(201).json({ message: "Loan and collections created successfully", loan });
    } catch (error) {
      console.error("Error generating loan:", error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};