const express = require("express");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const penaltyEndorsementRepository = require("../../Repositories/penaltyRespository");
const penaltyEndorsementServiceFactory = require("../../Services/penaltyService");

const router = express.Router();

module.exports = (db) => {
  const repo = penaltyEndorsementRepository(db);
  const service = penaltyEndorsementServiceFactory(repo, db);

 // PUT - Approve
router.put("/:id/approve", authenticateToken, authorizeRole("manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const approverId = req.user.id;

    const result = await service.approveEndorsement(id, approverId, remarks);
    res.json({ message: "Endorsement approved successfully", ...result });
  } catch (error) {
    console.error("Error approving endorsement:", error);
    res.status(500).json({ message: "Server error approving endorsement" });
  }
});

// PUT - Reject
router.put("/:id/reject", authenticateToken, authorizeRole("manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const approverId = req.user.id;

    const result = await service.rejectEndorsement(id, approverId, remarks);
    res.json({ message: "Endorsement rejected successfully", ...result });
  } catch (error) {
    console.error("Error rejecting endorsement:", error);
    res.status(500).json({ message: "Server error rejecting endorsement" });
  }
});


  return router;
};
