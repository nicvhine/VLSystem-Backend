const express = require("express");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const penaltyEndorsementRepository = require("../../Repositories/penaltyRespository");
const penaltyEndorsementServiceFactory = require("../../Services/penaltyService");
const notificationRepository = require("../../Repositories/notificationRepository");

const router = express.Router();

module.exports = (db) => {
  const repo = penaltyEndorsementRepository(db);
  const service = penaltyEndorsementServiceFactory(repo, db);
  const notifRepo = notificationRepository(db);

  router.post(
    "/endorse",
    authenticateToken,
    authorizeRole("collector"),
    express.json(),
    async (req, res) => {
      try {
        const { referenceNumber, reason, penaltyAmount, payableAmount } = req.body;
        const userId = req.user.id;
        const collectorName = req.user.name || "Collector";

        // find collection
        const collection = await db.collection("collections").findOne({ referenceNumber });
        if (!collection)
          return res.status(404).json({ message: "Collection not found" });

        // create penalty endorsement
        const result = await service.endorsePenalty(
          collection,
          { reason, penaltyAmount, payableAmount },
          userId
        );

        try {
          await notifRepo.insertLoanOfficerNotification({
            type: "penalty-endorsement",
            title: "New Penalty Endorsement",
            message: `${collectorName} endorsed penalty for collection ${referenceNumber}.`,
            referenceNumber,
            actor: {
              name: collectorName,
              role: "Collector",
            },
            read: false,
            viewed: false,
            createdAt: new Date(),
          });

          console.log("Loan officer notified of penalty endorsement.");
        } catch (notifyErr) {
          console.error("Failed to notify loan officer:", notifyErr.message);
        }

        res.status(201).json({
          message: "Penalty endorsement created and loan officer notified",
          ...result,
        });
      } catch (error) {
        console.error("Error endorsing penalty:", error);
        res.status(500).json({ message: "Server error endorsing penalty" });
      }
    }
  );

  return router;
};
