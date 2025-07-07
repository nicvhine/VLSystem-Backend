const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');

module.exports = (db) => {
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const logs = await db.collection('logs')
        .find()
        .sort({ timestamp: -1 })
        .toArray();
      res.status(200).json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  return router;
};
