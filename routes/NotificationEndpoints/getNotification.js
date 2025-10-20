const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");

module.exports = (db) => {

  // Role notifications
  router.get("/:role", authenticateToken, async (req, res) => {
    try {
      const role = (req.params.role || "").toLowerCase().trim();
      if (!["manager", "loan-officer"].includes(role)) return res.status(403).json({ error: "Invalid role" });
      if ((req.user?.role || "").toLowerCase().trim() !== role.replace("-", " ")) {
        return res.status(403).json({ error: "Access denied" });
      }
      const notifications = await service.getRoleNotifications(role);
      res.json(notifications);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Borrower notifications
  router.get("/borrower/:borrowersId", async (req, res) => {
    try {
      const borrowersId = req.params.borrowersId;
      const notifications = await service.getBorrowerNotifications(borrowersId);
      res.json(notifications);
    } catch (err) {
      console.error("Error fetching borrower notifications:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
