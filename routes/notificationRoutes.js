const express = require('express');
const router = express.Router();
const jwt = require("jsonwebtoken");


function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

module.exports = (db) => {
  

// GET: Loan Officer Notifications
router.get("/loan-officer", authenticateToken, async (req, res) => {
  try {
    console.log("🔹 Decoded JWT user:", req.user);

    const role = (req.user && req.user.role || "").toLowerCase().trim();
    console.log("🔹 Normalized role:", role);

    if (role !== "loan officer") {
      console.log("❌ Access denied: role is not loan officer");
      return res.status(403).json({ error: "Access denied. Loan officer role required." });
    }

    const notifications = await db
      .collection("loanOfficer_notifications")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    console.log(`🔹 Fetched ${notifications.length} notifications from loanOfficer_notifications`);
    if (notifications.length > 0) {
      console.log("🔹 First notification:", notifications[0]);
    }

    res.status(200).json(notifications);
  } catch (error) {
    console.error("❌ Error fetching loan officer notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications." });
  }
});


router.put("/notifications/loan-officer/:id/read", authenticateToken, async (req, res) => {
  try {
    const role = (req.user && req.user.role || "").toLowerCase().trim();

    if (role !== "loan officer") {
      return res.status(403).json({ error: "Access denied. Loan officer role required." });
    }

    const { id } = req.params;
    const result = await db.collection("loanOfficer_notifications").updateOne(
      { _id: new require("mongodb").ObjectId(id) },
      { $set: { read: true } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }

    res.status(200).json({ message: "Notification marked as read." });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to update notification." });
  }
});


router.get('/:borrowersId', async (req, res) => {
    const { borrowersId } = req.params;

    if (!borrowersId) {
      return res.status(400).json({ error: 'Missing borrowersId' });
    }

    try {
      const collectionsCol = db.collection('collections');
      const notificationsCol = db.collection('notifications');

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);

      const dueCollections = await collectionsCol.find({
        borrowersId,
        status: 'Unpaid',
        dueDate: { $gte: today, $lte: threeDaysLater }
      }).sort({ dueDate: 1 }).toArray();

      const existingDueRefs = (
        await notificationsCol.find({
          borrowersId,
          type: 'due'
        }).toArray()
      ).map(n => n.referenceNumber);

      const newDueNotifs = [];

      for (const c of dueCollections) {
        if (!existingDueRefs.includes(c.referenceNumber)) {
          const dueDate = new Date(c.dueDate);
          const diffTime = dueDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // in days

          const dueNotif = {
            id: `due-${c.referenceNumber}`,
            message: `📅 Payment due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} for Collection ${c.collectionNumber}`,
            referenceNumber: c.referenceNumber,
            borrowersId: c.borrowersId,
            date: c.dueDate,
            viewed: false,
            type: 'due',
            createdAt: new Date()
          };

          newDueNotifs.push(dueNotif);
        }
      }

      if (newDueNotifs.length > 0) {
        await notificationsCol.insertMany(newDueNotifs);
      }

      const allNotifs = await notificationsCol
        .find({ borrowersId })
        .sort({ date: -1 })
        .toArray();

      const finalMapped = allNotifs.map(n => ({
        ...n,
        id: n.id || `notif-${n.referenceNumber}-${Date.now()}`,
        type: n.type || 'success'
      }));

      res.json(finalMapped);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
