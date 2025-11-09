const express = require("express");
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const penaltyEndorsementRepository = require("../../repositories/penaltyRespository");
const penaltyEndorsementServiceFactory = require("../../services/penaltyService");

const router = express.Router();

module.exports = (db) => {
  const repo = penaltyEndorsementRepository(db);
  const service = penaltyEndorsementServiceFactory(repo, db);

  router.get("/", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    try {
      const endorsements = await service.getAllEndorsements();
      res.json(endorsements);
    } catch (error) {
      console.error("Error fetching penalty endorsements:", error);
      res.status(500).json({ message: "Server error fetching endorsements" });
    }
  });

  return router;
};
