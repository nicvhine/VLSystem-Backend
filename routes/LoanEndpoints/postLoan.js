const express = require("express");
const router = express.Router();
const { createLoan } = require("../../Services/loanService");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const LoanRepository = require("../../Repositories/loanRepository"); // Import repository

module.exports = (db) => {
  const repo = LoanRepository(db); // Initialize with db

  // Generate a new loan
  router.post(
    "/generate-loan/:applicationId",
    authenticateToken,
    authorizeRole("manager"),
    async (req, res) => {
      const { applicationId } = req.params;

      try {
        const loan = await createLoan(applicationId, db);
        res.status(201).json({ message: "Loan and collections created successfully", loan });
      } catch (error) {
        console.error("Error generating loan:", error);
        res.status(400).json({ error: error.message });
      }
    }
  );

  return router;
};
