const express = require('express');
const router = express.Router();

module.exports = (db) => {

// Save note
  router.put('/:referenceNumber/note', async (req, res) => {
    const { referenceNumber } = req.params;
    const { note } = req.body;
    console.log('PUT note called for', referenceNumber, note);

    if (typeof note !== 'string') {
      return res.status(400).json({ error: 'Note must be a string' });
    }

    try {
      const result = await db.collection('collections').findOneAndUpdate(
        { referenceNumber },
        { $set: { note } },
        { returnDocument: 'after' }
      );

      if (!result.value) return res.status(404).json({ error: 'Collection not found' });

      res.json(result.value);
    } catch (err) {
      console.error('Failed to update note:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
    return router;
}