const express = require("express");
const paymentService = require("../../Services/paymentService");

module.exports = (db) => {
  const router = express.Router();
  
  router.get("/ledger/:loanId", async (req, res) => {
    try {
      const loanId = req.params.loanId;
      const ledger = await paymentService.getLoanLedger(loanId, db);
      res.json({ success: true, payments: ledger });
    } catch (err) {
      console.error("Ledger error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get("/borrower/:borrowersId", async (req, res) => {
    try {
      const borrowersId = req.params.borrowersId;
      const payments = await paymentService.getBorrowerPayments(borrowersId, db);
      res.json(payments);
    } catch (err) {
      console.error("Borrower payments error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
