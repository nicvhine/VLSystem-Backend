const express = require("express");
const router = express.Router();
const ClosureService = require("../../Services/closureService");

module.exports = (db) => {
  const service = ClosureService(db);

  router.post("/", async (req, res) => {
    try {
      const { clientName, reason, date, authorizedBy, loanId } = req.body;
      if (!loanId) throw new Error("Loan ID is required");
  
      const result = await service.createClosure({ clientName, reason, date, authorizedBy, loanId });
      res.status(201).json({ message: "Closure created successfully", data: result });
    } catch (err) {
      console.error("Error creating endorsement:", err);
      res.status(500).json({ message: err.message });
    }
  });
  

  return router;
};