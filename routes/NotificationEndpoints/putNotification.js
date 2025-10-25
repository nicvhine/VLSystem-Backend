const express = require("express");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const service = require("../../Services/notificationService"); 

module.exports = (db) => {
  const router = express.Router();

  // Mark a single notification as read
  router.put(
    "/:role/:id/read",
    authenticateToken,
    authorizeRole("manager", "loan officer", "borrower"), 
    async (req, res) => {
      try {
        const role = req.params.role.toLowerCase().trim();
        const id = req.params.id;

        // user can only mark their own notifications
        if (
          (role === "borrower" && req.user.borrowersId !== id) ||
          (role === "manager" && req.user.role !== "manager") ||
          (role === "loan officer" && req.user.role !== "loan officer")
        ) {
          return res.status(403).json({ error: "Access denied" });
        }

        const notif = await service.markNotificationRead(role, id);
        res.json(notif);
      } catch (err) {
        console.error(err);
        res.status(404).json({ error: err.message });
      }
    }
  );

  // Mark all notifications for a role as read
  router.put(
    "/:role/read-all",
    authenticateToken,
    authorizeRole("manager", "loan officer", "borrower"),
    async (req, res) => {
      try {
        const role = req.params.role.toLowerCase().trim();

        // Only allow user to mark their own role notifications
        if (
          (role === "borrower" && req.user.role !== "borrower") ||
          (role === "manager" && req.user.role !== "manager") ||
          (role === "loan officer" && req.user.role !== "loan officer")
        ) {
          return res.status(403).json({ error: "Access denied" });
        }

        const result = await service.markAllRoleRead(role);
        res.json({ matched: result.matchedCount, modified: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
};
