const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { getBorrowerById } = require("../../Services/borrowerService");
const { decryptApplication } = require("../../Services/loanApplicationService");

module.exports = (db) => {
  router.get("/:id", authenticateToken, authorizeRole("borrower"), async (req, res) => {
    try {
      const { id } = req.params;

      const borrowerDetails = await getBorrowerById(id, db);

      const latestApplicationArr = await db
        .collection("loan_applications")
        .find({ borrowersId: id })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      const latestApplication = latestApplicationArr[0]
        ? decryptApplication(latestApplicationArr[0])
        : null;

      res.json({
        borrowerDetails,
        latestApplication,
      });
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({
        error: error.message || "Failed to fetch borrower",
      });
    }
  });

  router.get("/:id/balance", async (req, res) => {
    try {
      const { id } = req.params;

      const loans = await db
        .collection("loans")
        .find({ borrowersId: id })
        .toArray();

      const totalBalance = loans.reduce((sum, loan) => sum + (loan.balance || 0), 0);

      res.json({
        hasBalance: totalBalance > 0,
        totalBalance,
      });
    } catch (error) {
      console.error("Error checking borrower balance:", error);
      res.status(500).json({
        error: error.message || "Failed to check borrower balance",
      });
    }
  });

  return router;
};