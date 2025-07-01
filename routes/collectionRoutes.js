const express = require('express');
const router = express.Router();

module.exports = (db) => {
// GET COLLECTIONS
router.get('/', async (req, res) => {
  const collectorName = req.query.collector;
  const query = collectorName ? { collector: collectorName } : {};

  try {
    const collections = await db.collection('collections')
      .find(query)
      .sort({ collectionNumber: 1 })
      .toArray();

    const loanIds = [...new Set(collections.map(c => c.loanId))];
    const loans = await db.collection('loans')
      .find({ loanId: { $in: loanIds } })
      .toArray();

    const loanMap = {};
    loans.forEach(loan => {
      loanMap[loan.loanId] = loan;
    });

    const groupedByLoan = {};
    collections.forEach(c => {
      if (!groupedByLoan[c.loanId]) {
        groupedByLoan[c.loanId] = [];
      }
      groupedByLoan[c.loanId].push(c);
    });

    const enriched = [];

    for (const loanId in groupedByLoan) {
      const loanCollections = groupedByLoan[loanId];
      const loan = loanMap[loanId];

      let runningTotal = 0;

      loanCollections.forEach((col, index) => {
        const enrichedCol = {
          ...col,
          totalPayment: index === 0 ? 0 : runningTotal,
          balance: loan.totalPayable - runningTotal,
          loanBalance: loan.totalPayable - runningTotal, 
        };

        runningTotal += col.paidAmount || 0;
        enriched.push(enrichedCol);
      });
    }

    res.json(enriched);
  } catch (err) {
    console.error("Error loading collections:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:referenceNumber/pay', async (req, res) => {
  const { referenceNumber } = req.params;
  const { amount } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid payment amount." });
  }

  try {
    const now = new Date();

    const current = await db.collection("collections").findOne({ referenceNumber });

    if (!current) {
      return res.status(404).json({ error: "Collection not found." });
    }

    let remainingAmount = amount;
    let collectionNumber = current.collectionNumber;
    const paymentLogs = [];

    while (remainingAmount > 0) {
      const collection = await db.collection("collections").findOne({
        loanId: current.loanId,
        collectionNumber
      });

      if (!collection) break;

      const alreadyPaid = collection.paidAmount || 0;
      const due = collection.periodAmount;
      const remainingBalance = Math.max(due - alreadyPaid, 0);
      const paymentToApply = Math.min(remainingAmount, remainingBalance);
      const newPaid = alreadyPaid + paymentToApply;
      const newBalance = Math.max(due - newPaid, 0);
      const newStatus = newBalance === 0 ? 'Paid' : 'Partial';

      // Update collection
      await db.collection("collections").updateOne(
        { referenceNumber: collection.referenceNumber },
        {
          $set: {
            paidAmount: newPaid,
            balance: newBalance,
            status: newStatus,
            note: newStatus === 'Paid' ? '' : (collection.note || '')
          }
        }
      );

      // Log payment
      paymentLogs.push({
        loanId: current.loanId,
        referenceNumber: collection.referenceNumber,
        borrowersId: current.borrowersId,
        collector: current.collector || null,
        amount: paymentToApply,
        balance: newBalance,
        paidToCollection: collection.collectionNumber,
        datePaid: now,
        createdAt: now
      });

      remainingAmount -= paymentToApply;
      collectionNumber++;
    }

    // Update loan totals
    await db.collection("loans").updateOne(
      { loanId: current.loanId },
      {
        $inc: {
          paidAmount: amount,
          balance: -amount
        }
      }
    );

    // Insert all payment logs
    await db.collection("payments").insertMany(paymentLogs);

    res.json({
      message: "Payment recorded successfully",
      paymentLogs,
      totalPaid: amount,
      collectionsCovered: paymentLogs.length,
      remainingUnapplied: remainingAmount
    });

  } catch (error) {
    console.error("Error adding payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



  // GET COLLECTORS
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

  return router;
};
