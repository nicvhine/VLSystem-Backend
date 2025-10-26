const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { getBorrowerById } = require("../../Services/borrowerService");
const { decryptApplication } = require("../../Services/loanApplicationService");
const loanRepository = require("../../Repositories/loanRepository");

module.exports = (db) => {
  // Get borrower details + latest loan application
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

  // Get active loan balance
  router.get("/:borrowersId/balance", async (req, res) => {
    try {
      const { borrowersId } = req.params;

      // Use repository method to fetch all active loans
      const activeLoans = await loanRepository(db).findActiveLoansByBorrowerId(borrowersId);

      // If multiple active loans exist, pick the most recent one (optional)
      const activeLoan = activeLoans.length > 0 ? activeLoans[0] : null;

      const balance = activeLoan ? activeLoan.balance : 0;

      res.json({ balance });
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  return router;
};
