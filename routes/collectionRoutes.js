const express = require('express');
const router = express.Router();
const { applyOverduePenalty, determineLoanStatus } = require('../utils/collection');

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

  // GET payment schedule for a borrower and loan
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

  // GET collection stats
  router.get("/collection-stats", async (req, res) => {
    try {
      const result = await db.collection("collections").aggregate([
        { $group: { _id: null, totalCollectables: { $sum: "$periodAmount" }, totalCollected: { $sum: "$paidAmount" }, totalPenalty: { $sum: "$penalty" } } }
      ]).toArray();

      const totalCollectables = result[0]?.totalCollectables || 0;
      const totalCollected = result[0]?.totalCollected || 0;
      const totalPenalty = result[0]?.totalPenalty || 0;
      const totalUnpaid = totalCollectables + totalPenalty - totalCollected;

      res.json({ totalCollectables, totalCollected, totalUnpaid, totalPenalty });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch collection stats" });
    }
  });

  // -----------------------------
  // GENERAL / DYNAMIC ROUTES LAST
  // -----------------------------

  router.get('/:loanId', async (req, res) => {
    const { loanId } = req.params;
  
    try {
      const loan = await db.collection('loans').findOne({ loanId });
      if (!loan) return res.status(404).json({ error: 'Loan not found' });
  
      const collections = await db.collection('collections').find({ loanId }).toArray();
      const updatedCollections = collections.map(c => applyOverduePenalty(c));
  
      for (const c of updatedCollections) {
        await db.collection('collections').updateOne(
          { referenceNumber: c.referenceNumber },
          { $set: { status: c.status, balance: c.balance, penalty: c.penalty || 0 } }
        );
      }
  
      const loanStatus = determineLoanStatus(updatedCollections);
      if (loan.status !== loanStatus) {
        await db.collection('loans').updateOne({ loanId }, { $set: { status: loanStatus } });
        loan.status = loanStatus;
      }
  
      res.json({ ...loan, collections: updatedCollections });
  
    } catch (err) {
      console.error('Error fetching loan:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
