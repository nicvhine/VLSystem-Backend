const express = require('express');
const authenticateToken = require('../../Middleware/auth');
const authorizeRole = require('../../Middleware/authorizeRole');
const router = express.Router();

module.exports = (db) => {

  // Save note
  router.put(
    '/:referenceNumber/note', 
    authenticateToken, 
    authorizeRole('collector'),
    async (req, res) => {
      const { referenceNumber } = req.params;
      const { note } = req.body;
      const { username } = req.user; 

      if (typeof note !== 'string') {
        return res.status(400).json({ error: 'Note must be a string' });
      }

      try {
        // Collector can only comment on their assigned collections
        const collection = await db.collection('collections').findOne({ referenceNumber });

        if (!collection) return res.status(404).json({ error: 'Collection not found' });
        if (collection.collector !== username) {
          return res.status(403).json({ error: 'You can only update notes on your own collections' });
        }

        const result = await db.collection('collections').findOneAndUpdate(
          { referenceNumber },
          { $set: { note } },
          { returnDocument: 'after' }
        );

        res.json(result.value);
      } catch (err) {
        console.error('Failed to update note:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
};
