const express = require("express");
const paymentService = require("../../services/paymentService");
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const { addBorrowerPaymentNotification } = require("../../services/borrowerNotif");

module.exports = (db) => {
  const router = express.Router();

  // Cash payment
  router.post(
    "/:referenceNumber/cash",
    authenticateToken,
    authorizeRole("collector"),
    async (req, res) => {
      try {
        const { name } = req.user; 
        const { referenceNumber } = req.params;
  
        // Fetch the collection to verify assignment
        const collection = await db.collection("collections").findOne({ referenceNumber });
  
        if (!collection) {
          return res.status(404).json({ error: "Collection not found" });
        }
  
        if (collection.collector !== name) {
          return res.status(403).json({ error: "You can only process payments for your assigned collections." });
        }
  
        // Process the cash payment
        const result = await paymentService.handleCashPayment(
          { referenceNumber, ...req.body },
          db
        );
  
        //  Notify borrower
        if (result?.borrowersId && result?.amount) {
          await addBorrowerPaymentNotification(
            db,
            result.borrowersId,
            referenceNumber,
            result.amount,
            "Cash"
          );
        }

        res.json(result);
      } catch (err) {
        console.error("Cash payment error:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );
  
 // PayMongo GCash: create intent (borrower only)
  router.post(
    "/paymongo/gcash",
    authenticateToken,
    authorizeRole("borrower"),
    async (req, res) => {
      try {
        const { borrowersId } = req.user; 
        const result = await paymentService.createPaymongoGcash({ ...req.body, borrowersId }, db);
        res.json(result);
      } catch (err) {
        console.error("PayMongo GCash error:", err.response?.data || err.message);
        res.status(500).json({ error: "PayMongo payment failed" });
      }
    }
  );

  router.post(
    "/:referenceNumber/paymongo/success",
    authenticateToken,
    authorizeRole("borrower"),
    async (req, res) => {
      try {
        const { borrowersId } = req.user;
        const referenceNumber = req.params.referenceNumber;

        // Verify that this payment belongs to the borrower
        const collection = await db.collection("collections").findOne({ referenceNumber });
        if (!collection) {
          return res.status(404).json({ error: "Collection not found" });
        }
        if (collection.borrowersId !== borrowersId) {
          return res.status(403).json({ error: "You can only confirm payments for your own loans." });
        }

        const result = await paymentService.handlePaymongoSuccess(referenceNumber, db);
        res.json({ success: true, ...result });
      } catch (err) {
        console.error("PayMongo success error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  return router;
};
