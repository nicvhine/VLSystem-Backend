const express = require('express');
const router = express.Router();

module.exports = (db) => {

  // Get all collections (optionally filtered by collector)
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

  // Get payment schedule by borrower and loan
  router.get('/schedule/:borrowersId/:loanId', async (req, res) => {
    const { borrowersId, loanId } = req.params;

    try {
      const schedule = await db.collection('collections')
        .find({ borrowersId, loanId })
        .sort({ collectionNumber: 1 })
        .toArray();

      if (!schedule || schedule.length === 0) {
        return res.status(404).json({ error: 'No payment schedule found for this borrower and loan.' });
      }

      res.json(schedule);

    } catch (err) {
      console.error('Error fetching payment schedule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET collectors
  router.get('/collectors', async (req, res) => {
    try {
      const collectors = await db.collection('users').find({ role: 'collector' }).toArray();
      const names = collectors.map(c => c.name);
      res.json(names);
    } catch (err) {
      console.error('Failed to fetch collectors:', err);
      res.status(500).json({ error: 'Failed to load collectors' });
    }
  });


  // Get loan by ID with collections (no overdue penalties)
  router.get('/:loanId', async (req, res) => {
    const { loanId } = req.params;

    try {
      const loan = await db.collection('loans').findOne({ loanId });
      if (!loan) return res.status(404).json({ error: 'Loan not found' });

      const collections = await db.collection('collections').find({ loanId }).toArray();
      res.json({ ...loan, collections });

    } catch (err) {
      console.error('Error fetching loan:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
