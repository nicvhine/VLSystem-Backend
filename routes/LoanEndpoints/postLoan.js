const express = require("express");
const router = express.Router();
const { createLoan } = require("../../Services/loanService");

module.exports = (db) => {
  router.post("/generate-loan/:applicationId", async (req, res) => {
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
