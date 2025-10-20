const express = require("express");
const paymentService = require("../../Services/paymentService");

module.exports = (db) => {
  const router = express.Router();

  // Cash payment
  router.post("/:referenceNumber/cash", async (req, res) => {
    try {
      const result = await paymentService.handleCashPayment({ 
        referenceNumber: req.params.referenceNumber, 
        ...req.body 
      }, db);
      res.json(result);
    } catch (err) {
      console.error("Cash payment error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PayMongo GCash: create intent
  router.post("/paymongo/gcash", async (req, res) => {
    try {
      const result = await paymentService.createPaymongoGcash(req.body, db);
      res.json(result);
    } catch (err) {
      console.error("PayMongo GCash error:", err.response?.data || err.message);
      res.status(500).json({ error: "PayMongo payment failed" });
    }
  });

  // Handle PayMongo success callback
  router.post("/:referenceNumber/paymongo/success", async (req, res) => {
    try {
      const result = await paymentService.handlePaymongoSuccess(req.params.referenceNumber, db);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("PayMongo success error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
