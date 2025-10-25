const express = require("express");
const paymentService = require("../../Services/paymentService");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");

module.exports = (db) => {
  const router = express.Router();
  
  router.get(
    "/ledger/:loanId",
    authenticateToken,
    authorizeRole("manager", "loan officer", "borrower", "head", "collector"),
    async (req, res) => {
      try {
        const { role, borrowersId: jwtBorrowersId, username } = req.user;
        const loanId = req.params.loanId;
  
        const ledger = await paymentService.getLoanLedger(loanId, db);
  
        // Restrict access for borrower or collector
        if (role === "borrower") {
          // Only allow borrower if the ledger belongs to them
          if (!ledger.every(p => p.borrowersId === jwtBorrowersId)) {
            return res.status(403).json({ success: false, message: "Access denied" });
          }
        } else if (role === "collector") {
          // Only allow collector if they are the assigned collector
          if (!ledger.every(p => p.collector === username)) {
            return res.status(403).json({ success: false, message: "Access denied" });
          }
        }
  
        res.json({ success: true, payments: ledger });
      } catch (err) {
        console.error("Ledger error:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );  

  router.get(
    "/borrower/:borrowersId",
    authenticateToken,
    authorizeRole("manager", "loan officer", "head", "borrower"),
    async (req, res) => {
      try {
        const { role, borrowersId: jwtBorrowersId } = req.user;
        const borrowersId = req.params.borrowersId;
  
        // Borrower can only fetch their own payments
        if (role === "borrower" && borrowersId !== jwtBorrowersId) {
          return res.status(403).json({ error: "Access denied" });
        }
  
        const payments = await paymentService.getBorrowerPayments(borrowersId, db);
        res.json(payments);
      } catch (err) {
        console.error("Borrower payments error:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );
  

  return router;
};
