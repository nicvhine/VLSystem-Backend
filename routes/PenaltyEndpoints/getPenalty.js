const express = require("express");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const penaltyEndorsementRepository = require("../../Repositories/penaltyRespository");
const penaltyEndorsementServiceFactory = require("../../Services/penaltyService");

const router = express.Router();

module.exports = (db) => {
  const repo = penaltyEndorsementRepository(db);
  const service = penaltyEndorsementServiceFactory(repo, db);

  router.get("/", authenticateToken, authorizeRole("manager"), async (req, res) => {
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
