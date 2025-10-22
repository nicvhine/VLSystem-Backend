const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const notificationService = require("../../Services/notificationService");
module.exports = (db) => {

   // Role notifications
   router.get("/:role", authenticateToken, async (req, res) => {
    try {
      const role = (req.params.role || "").toLowerCase().trim();
      if (!["manager", "loan-officer"].includes(role)) 
        return res.status(403).json({ error: "Invalid role" });

      if ((req.user?.role || "").toLowerCase().trim() !== role.replace("-", " ")) {
        return res.status(403).json({ error: "Access denied" });
      }

      let notifications;
      if (role === "loan-officer") {
        notifications = await notificationService.getLoanOfficerNotifications(db);
      } else if (role === "manager") {
        notifications = await notificationService.getManagerNotifications(db);
      }

      res.json({ notifications });
    } catch (err) {
      console.error("Error fetching notifications:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Borrower notifications
  router.get("/borrower/:borrowersId", async (req, res) => {
    try {
      const borrowersId = req.params.borrowersId;
      const notifications = await notificationService.getBorrowerNotifications(db, borrowersId);
      res.json({ notifications });
    } catch (err) {
      console.error("Error fetching borrower notifications:", err);
      res.status(500).json({ error: err.message });
    }
  });


  return router;
};
