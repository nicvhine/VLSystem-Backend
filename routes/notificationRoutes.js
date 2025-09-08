const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token provided" });

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
      const role = (req.user?.role || "").toLowerCase().trim();
      if (role !== "loan officer") {
        return res
          .status(403)
          .json({ error: "Access denied. Loan officer role required." });
      }

      const notifications = await db
        .collection("loanOfficer_notifications")
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      res.status(200).json(notifications);
    } catch (error) {
      console.error("❌ Error fetching loan officer notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications." });
    }
  });

  router.get("/manager", authenticateToken, async (req, res) => {
    try {
      const role = (req.user?.role || "").toLowerCase().trim();
      if (role !== "manager") {
        return res
          .status(403)
          .json({ error: "Access denied. Manager role required." });
      }

      const notifications = await db
        .collection("manager_notifications")
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      res.status(200).json(notifications);
    } catch (error) {
      console.error("❌ Error fetching manager notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications." });
    }
  });


  // PUT: Mark single notification as read
  router.put("/loan-officer/:id/read", authenticateToken, async (req, res) => {
    try {
      const rawId = req.params.id;
      let filter;

      if (ObjectId.isValid(rawId)) {
        filter = { _id: new ObjectId(rawId) };
      } else {
        filter = { id: rawId };
      }

      const result = await db
        .collection("loanOfficer_notifications")
        .findOneAndUpdate(
          filter,
          { $set: { read: true } },
          { returnDocument: "after" }
        );

      if (!result.value) {
        return res.status(404).json({ message: "Notification not found" });
      }

      return res.json(result.value);
    } catch (err) {
      console.error("❌ Error in PUT /loan-officer/:id/read:", err);
      return res.status(500).json({ error: "Failed to update notification" });
    }
  });

    // PUT: Mark single notification as read
    router.put("/manager/:id/read", authenticateToken, async (req, res) => {
      try {
        const rawId = req.params.id;
        let filter;
  
        if (ObjectId.isValid(rawId)) {
          filter = { _id: new ObjectId(rawId) };
        } else {
          filter = { id: rawId };
        }
  
        const result = await db
          .collection("manager_notifications")
          .findOneAndUpdate(
            filter,
            { $set: { read: true } },
            { returnDocument: "after" }
          );
  
        if (!result.value) {
          return res.status(404).json({ message: "Notification not found" });
        }
  
        return res.json(result.value);
      } catch (err) {
        console.error("❌ Error in PUT /manager/:id/read:", err);
        return res.status(500).json({ error: "Failed to update notification" });
      }
    });

  // PUT: Mark all as read
  router.put("/loan-officer/read-all", authenticateToken, async (req, res) => {
    try {
      const updateResult = await db
        .collection("loanOfficer_notifications")
        .updateMany({ read: false }, { $set: { read: true } });

      return res.json({
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
      });
    } catch (err) {
      console.error("❌ Error in PUT /loan-officer/read-all:", err);
      return res
        .status(500)
        .json({ error: "Failed to mark all as read", details: err.message });
    }
  });

   router.put("/manager/read-all", authenticateToken, async (req, res) => {
    try {
      const updateResult = await db
        .collection("manager_notifications")
        .updateMany({ read: false }, { $set: { read: true } });

      return res.json({
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
      });
    } catch (err) {
      console.error("❌ Error in PUT /manager/read-all:", err);
      return res
        .status(500)
        .json({ error: "Failed to mark all as read", details: err.message });
    }
  });

  // Borrower notifications (due payments)
  router.get("/:borrowersId", async (req, res) => {
    const { borrowersId } = req.params;
    if (!borrowersId) {
      return res.status(400).json({ error: "Missing borrowersId" });
    }

    try {
      const collectionsCol = db.collection("collections");
      const notificationsCol = db.collection("notifications");

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);

      const dueCollections = await collectionsCol
        .find({
          borrowersId,
          status: "Unpaid",
          dueDate: { $gte: today, $lte: threeDaysLater },
        })
        .sort({ dueDate: 1 })
        .toArray();

      const existingDueRefs = (
        await notificationsCol
          .find({ borrowersId, type: "due" })
          .toArray()
      ).map((n) => n.referenceNumber);

      const newDueNotifs = [];

      for (const c of dueCollections) {
        if (!existingDueRefs.includes(c.referenceNumber)) {
          const dueDate = new Date(c.dueDate);
          const diffTime = dueDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          const dueNotif = {
            id: `due-${c.referenceNumber}`,
            message: `📅 Payment due in ${daysRemaining} day${
              daysRemaining !== 1 ? "s" : ""
            } for Collection ${c.collectionNumber}`,
            referenceNumber: c.referenceNumber,
            borrowersId: c.borrowersId,
            date: c.dueDate,
            read: false,
            type: "due",
            createdAt: new Date(),
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

      res.json(allNotifs);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
