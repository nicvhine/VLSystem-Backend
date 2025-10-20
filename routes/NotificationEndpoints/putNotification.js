const express = require("express");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../../Middleware/auth");

module.exports = (db) => {
  const router = express.Router();

  router.put("/:role/:id/read", authenticateToken, async (req, res) => {
    try {
      const role = req.params.role.toLowerCase().trim();
      const id = req.params.id;
      const notif = await service.markNotificationRead(role, id);
      res.json(notif);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.put("/:role/read-all", authenticateToken, async (req, res) => {
    try {
      const role = req.params.role.toLowerCase().trim();
      const result = await service.markAllRoleRead(role);
      res.json({ matched: result.matchedCount, modified: result.modifiedCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
