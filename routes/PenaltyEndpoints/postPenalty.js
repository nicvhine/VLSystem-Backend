const express = require("express");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const penaltyEndorsementRepository = require("../../Repositories/penaltyRespository");
const penaltyEndorsementServiceFactory = require("../../Services/penaltyService");

const router = express.Router();

module.exports = (db) => {
  const repo = penaltyEndorsementRepository(db);
  const service = penaltyEndorsementServiceFactory(repo, db);

  router.post(
    "/endorse",
    authenticateToken,
    authorizeRole("collector"),
    express.json(), // parse JSON
    async (req, res) => {
      try {
        const { referenceNumber, reason, penaltyAmount, payableAmount } = req.body;
        const userId = req.user.id;

        const collection = await db.collection("collections").findOne({ referenceNumber });
        if (!collection) return res.status(404).json({ message: "Collection not found" });

        const result = await service.endorsePenalty(
          collection,
          { reason, penaltyAmount, payableAmount },
          userId
        );

        res.status(201).json({ message: "Penalty endorsement created", ...result });
      } catch (error) {
        console.error("Error endorsing penalty:", error);
        res.status(500).json({ message: "Server error endorsing penalty" });
      }
    }
  );

  return router;
};
