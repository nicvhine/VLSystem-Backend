const express = require('express');
const router = express.Router();
const { applyOverduePenalty } = require('../../Utils/collection');

module.exports = (db) => {

// GET all collections (optionally by collector)
router.get('/', async (req, res) => {
    try {
      const collectorName = req.query.collector;
      const query = collectorName ? { collector: collectorName } : {};
      const collections = await db.collection('collections')
        .find(query)
        .sort({ collectionNumber: 1 })
        .toArray();
  
      res.json(collections);
    } catch (err) {
      console.error("Error loading collections:", err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

 // GET COLLECTIONS
 router.get('/schedule/:borrowersId/:loanId', async (req, res) => {
    const { borrowersId, loanId } = req.params;

    try {
      let schedule = await db.collection('collections')
        .find({ borrowersId, loanId })
        .sort({ collectionNumber: 1 })
        .toArray();

      if (!schedule || schedule.length === 0) {
        return res.status(404).json({ error: 'No payment schedule found for this borrower and loan.' });
      }

      for (let col of schedule) {
        const updated = applyOverduePenalty(col);
        if (updated.status === 'Overdue' && col.status !== 'Overdue') {
          await db.collection('collections').updateOne(
            { referenceNumber: col.referenceNumber },
            { $set: { status: 'Overdue', penalty: updated.penalty, balance: updated.balance } }
          );
        }
      }

      schedule = await db.collection('collections')
        .find({ borrowersId, loanId })
        .sort({ collectionNumber: 1 })
        .toArray();

      res.json(schedule);

    } catch (err) {
      console.error('Error fetching payment schedule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}