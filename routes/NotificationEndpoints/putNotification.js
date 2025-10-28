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

        // Validate role ownership
        if (role === "manager" && (req.user.role || "").toLowerCase() !== "manager") {
          return res.status(403).json({ error: "Access denied" });
        }
        if (role === "loan-officer" && (req.user.role || "").toLowerCase() !== "loan officer") {
          return res.status(403).json({ error: "Access denied" });
        }
        if (role === "borrower" && (req.user.role || "").toLowerCase() !== "borrower") {
          return res.status(403).json({ error: "Access denied" });
        }

        const borrowersId = role === "borrower" ? req.user.borrowersId : undefined;
        const result = await service.markNotificationRead(db, role, id, borrowersId);
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(404).json({ error: err.message });
      }
    }
  );

  // Mark all notifications as read for current user's role
  router.put(
    "/:role/read-all",
    authenticateToken,
    authorizeRole("manager", "loan officer", "borrower"),
    async (req, res) => {
      try {
        const role = req.params.role.toLowerCase().trim();

        if (role === "manager" && (req.user.role || "").toLowerCase() !== "manager") {
          return res.status(403).json({ error: "Access denied" });
        }
        if (role === "loan-officer" && (req.user.role || "").toLowerCase() !== "loan officer") {
          return res.status(403).json({ error: "Access denied" });
        }
        if (role === "borrower" && (req.user.role || "").toLowerCase() !== "borrower") {
          return res.status(403).json({ error: "Access denied" });
        }

        const borrowersId = role === "borrower" ? req.user.borrowersId : undefined;
        const result = await service.markAllRoleRead(db, role, borrowersId);
        res.json({ matched: result.matchedCount, modified: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
};
