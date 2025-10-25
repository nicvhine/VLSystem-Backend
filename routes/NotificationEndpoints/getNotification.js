const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");
const notificationService = require("../../Services/notificationService");

module.exports = (db) => {

  // Staff notifications by role
  router.get(
    "/:role",
    authenticateToken,
    authorizeRole("manager", "loan officer"), 
    async (req, res) => {
      try {
        const role = (req.params.role || "").toLowerCase().trim();

        // user can only fetch their own role notifications
        if ((req.user?.role || "").toLowerCase().trim() !== role.replace("-", " ")) {
          return res.status(403).json({ error: "Access denied" });
        }

        let notifications;
        if (role === "loan-officer") {
          notifications = await notificationService.getLoanOfficerNotifications(db);
        } else if (role === "manager") {
          notifications = await notificationService.getManagerNotifications(db);
        } else {
          return res.status(400).json({ error: "Invalid role" });
        }

        res.json({ notifications });

      } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Borrower notifications
  router.get(
    "/borrower/:borrowersId",
    authenticateToken,
    authorizeRole("borrower"), 
    async (req, res) => {
      try {
        const borrowersId = req.params.borrowersId;

        // Borrower can only fetch their own notifications
        if (req.user.borrowersId !== borrowersId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const notifications = await notificationService.getBorrowerNotifications(db, borrowersId);
        res.json({ notifications });

      } catch (err) {
        console.error("Error fetching borrower notifications:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
};
