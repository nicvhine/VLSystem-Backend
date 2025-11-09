const express = require("express");
const router = express.Router();
const ClosureService = require("../../services/closureService");
const notificationRepository = require("../../repositories/notificationRepository");

module.exports = (db) => {
  const service = ClosureService(db);
  const notifRepo = notificationRepository(db); 

  router.post("/", async (req, res) => {
    try {
      const { clientName, reason, date, authorizedBy, loanId } = req.body;
      if (!loanId) throw new Error("Loan ID is required");

      const result = await service.createClosure({
        clientName,
        reason,
        date,
        authorizedBy,
        loanId,
      });

      res.status(201).json({
        message: "Closure created successfully",
        data: result,
      });

      try {
        await notifRepo.insertManagerNotification({
          type: "closure-endorsement",
          title: "New Loan Endorsed for Closure",
          message: `${authorizedBy} has endorsed loan ${loanId} for closure.`,
          loanId,
          actor: {
            name: authorizedBy,
            role: "Loan Officer",
          },
          read: false,
          viewed: false,
          createdAt: new Date(),
        });

        console.log("Manager notified about closure endorsement.");
      } catch (notifyErr) {
        console.error("Failed to create manager notification:", notifyErr.message);
      }
    } catch (err) {
      console.error("❌ Error creating endorsement:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  return router;
};
