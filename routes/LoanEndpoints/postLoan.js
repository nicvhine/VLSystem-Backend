const express = require("express");
const router = express.Router();

const loanRepository = require("../../repositories/loanRepository");
const { createLoan } = require("../../Services/loanService");

module.exports = (db) => {
  const repo = loanRepository(db);

  router.post("/generate-loan/:applicationId", async (req, res) => {
    const { applicationId } = req.params;

    try {
      const loan = await createLoan(applicationId, repo);
      res.status(201).json({ message: "Loan and collections created successfully", loan });
    } catch (error) {
      console.error("Error generating loan:", error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};
