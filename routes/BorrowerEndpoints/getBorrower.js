const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { getBorrowerById } = require("../../Services/borrowerService");
const { decryptApplication } = require("../../Services/loanApplicationService");
const loanRepository = require("../../Repositories/loanRepository");

module.exports = (db) => {

    // GET all borrowers
    router.get("/", authenticateToken, authorizeRole("manager", "loan officer", "head"), async (req, res) => {
      try {
        const borrowers = await db
          .collection("borrowers_account")
          .find({})
          .toArray();
  
        const sanitizedBorrowers = borrowers.map(b => ({
          borrowersId: b.borrowersId,
          name: b.name,
          email: b.email,
          phoneNumber: b.phoneNumber,
          status: b.status
        }));
  
        res.json(sanitizedBorrowers);
      } catch (error) {
        console.error("Error fetching borrowers:", error);
        res.status(500).json({ error: error.message || "Failed to fetch borrowers" });
      }
    });

  // Get borrower details + latest loan application
  router.get("/:borrowersId", authenticateToken, authorizeRole("borrower", "manager"), async (req, res) => {
    try {
      const { borrowersId } = req.params;

      const borrowerDetails = await getBorrowerById(borrowersId, db);

      const latestApplicationArr = await db
        .collection("loan_applications")
        .find({ borrowersId: borrowersId })
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

  router.get("/:id/stats", authenticateToken, authorizeRole("borrower", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
  
      // Fetch total loans
      const totalLoans = await db.collection("loans").countDocuments({ borrowersId: id });
  
      // Fetch total loan applications
      const totalApplications = await db.collection("loan_applications").countDocuments({ borrowersId: id });
  
      // Fetch active loan 
      const activeLoan = await db.collection("loans").findOne({ borrowersId: id, status: "Active" });
  
      // Fetch latest loan
      const latestLoan = await db
        .collection("loans")
        .find({ borrowersId: id })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
  
      // Calculate total amount borrowed
      const allLoans = await db.collection("loans").find({ borrowersId: id }).toArray();
      const totalBorrowed = allLoans.reduce((sum, l) => sum + (l.amountReleased || 0), 0);
  
      res.json({
        totalLoans,
        totalApplications,
        totalBorrowed,
        hasActiveLoan: !!activeLoan,
        latestLoan: latestLoan[0] || null,
      });
    } catch (error) {
      console.error("Error fetching borrower stats:", error);
      res.status(500).json({ error: error.message || "Failed to fetch borrower stats" });
    }
  });
  
  return router;
};
