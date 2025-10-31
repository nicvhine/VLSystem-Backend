const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const { getBorrowerById } = require("../../Services/borrowerService");
const { decryptApplication } = require("../../Services/loanApplicationService");
const loanRepository = require("../../Repositories/loanRepository");

module.exports = (db) => {
  // GET all borrowers
  router.get(
    "/",
    authenticateToken,
    authorizeRole("manager", "loan officer", "head"),
    async (req, res) => {
      try {
        const borrowers = await db.collection("borrowers_account").find({}).toArray();

        const sanitizedBorrowers = borrowers.map((b) => ({
          borrowersId: b.borrowersId,
          name: b.name,
          email: b.email,
          phoneNumber: b.phoneNumber,
          status: b.status,
        }));

        res.json(sanitizedBorrowers);
      } catch (error) {
        console.error("Error fetching borrowers:", error);
        res.status(500).json({ error: error.message || "Failed to fetch borrowers" });
      }
    }
  );

    // Overview: total borrowers + top borrowers by total loan amount
    router.get(
      "/overview",
      authenticateToken,
      authorizeRole("manager", "loan officer", "head"),
      async (req, res) => {
        try {
          const borrowers = await db.collection("borrowers_account").find({}).toArray();
    
          // Only consider disbursed loans (Active, Inactive, Closed)
          const releasedLoans = await db
            .collection("loan_applications")
            .aggregate([
              {
                $match: {
                  borrowersId: { $exists: true, $ne: null },
                  status: { $in: ["Active", "Inactive", "Closed"] },
                },
              },
              {
                $group: {
                  _id: "$borrowersId",
                  totalLoanAmount: { $sum: { $toDouble: "$appLoanAmount" } },
                },
              },
            ])
            .toArray();
    
          const borrowerData = borrowers.map((b) => {
            const loanData = releasedLoans.find((r) => r._id === b.borrowersId);
            return {
              borrowersId: b.borrowersId,
              name: b.name,
              email: b.email,
              phoneNumber: b.phoneNumber,
              totalBorrowedAmount: loanData ? loanData.totalLoanAmount : 0,
            };
          });
    
          const topBorrowers = borrowerData
            .sort((a, b) => b.totalBorrowedAmount - a.totalBorrowedAmount)
            .slice(0, 5);
    
          res.json({
            totalBorrowers: borrowers.length,
            topBorrowers,
          });
        } catch (error) {
          console.error("Error fetching borrower overview:", error);
          res.status(500).json({ error: error.message || "Failed to fetch borrower overview" });
        }
      }
    );
    
  

  // Get borrower details + latest loan application + total borrowed
  router.get(
    "/:borrowersId",
    authenticateToken,
    authorizeRole("borrower", "manager"),
    async (req, res) => {
      try {
        const { borrowersId } = req.params;
  
        const borrowerDetails = await getBorrowerById(borrowersId, db);
        if (!borrowerDetails) {
          return res.status(404).json({ error: "Borrower not found" });
        }
  
        const latestApplicationArr = await db
          .collection("loan_applications")
          .find({ borrowersId })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
  
        const latestApplication = latestApplicationArr[0]
          ? decryptApplication(latestApplicationArr[0])
          : null;
  
        const totalLoans = await db
          .collection("loan_applications")
          .aggregate([
            { $match: { borrowersId } },
            { $group: { _id: null, totalBorrowedAmount: { $sum: { $toDouble: "$appLoanAmount" } } } },
          ])
          .toArray();
  
        const totalBorrowedAmount = totalLoans[0]?.totalBorrowedAmount || 0;
  
        res.json({
          borrowerDetails,
          latestApplication,
          totalBorrowedAmount,
        });
      } catch (error) {
        console.error("Error fetching borrower:", error);
        res.status(500).json({ error: error.message || "Failed to fetch borrower" });
      }
    }
  );
  

  // Get active loan balance
  router.get("/:borrowersId/balance", async (req, res) => {
    try {
      const { borrowersId } = req.params;

      const activeLoans = await loanRepository(db).findActiveLoansByBorrowerId(borrowersId);
      const activeLoan = activeLoans.length > 0 ? activeLoans[0] : null;

      const balance = activeLoan ? activeLoan.balance : 0;

      res.json({ balance });
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Borrower stats
  router.get(
    "/:id/stats",
    authenticateToken,
    authorizeRole("borrower", "manager"),
    async (req, res) => {
      try {
        const { id } = req.params;

        const totalLoans = await db.collection("loans").countDocuments({ borrowersId: id });
        const totalApplications = await db.collection("loan_applications").countDocuments({ borrowersId: id });

        const activeLoan = await db.collection("loans").findOne({ borrowersId: id, status: "Active" });

        const latestLoan = await db
          .collection("loans")
          .find({ borrowersId: id })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();

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
    }
  );


  return router;
};
