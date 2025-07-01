const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // GET COLLECTIONS
  router.get('/', async (req, res) => {
  const collectorName = req.query.collector;

  const query = collectorName ? { collector: collectorName } : {};
  const filteredCollections = await db.collection('collections').find(query).toArray();

  const withTotalPayment = filteredCollections.map(col => ({
    ...col,
    totalPayment: (col.paidAmount || 0) + (col.balance || 0),
  }));

  console.log(`Filtered collections for: ${collectorName}`, withTotalPayment); 
  res.json(withTotalPayment);
});


// MAKE PAYMENT
router.post('/:referenceNumber/pay', async (req, res) => {
  const { referenceNumber } = req.params;
  const { amount } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid payment amount." });
  }

  try {
    const current = await db.collection("collections").findOne({ referenceNumber });

    if (!current) {
      return res.status(404).json({ error: "Collection not found." });
    }

    const updatedPaidAmount = (current.paidAmount || 0) + amount;
    const isPaid = updatedPaidAmount >= current.periodAmount;
    const newStatus = isPaid ? 'Paid' : 'Partial';

    // 1. Update the current collection document
    await db.collection("collections").updateOne(
      { referenceNumber },
      {
        $set: {
          paidAmount: updatedPaidAmount,
          status: newStatus,
          note: isPaid ? '' : (current.note || ''),
        }
      }
    );

    // 2. If Paid, update balance of the next collection
    if (isPaid) {
      const nextCollection = await db.collection("collections").findOne({
        loanId: current.loanId,
        collectionNumber: current.collectionNumber + 1
      });

      if (nextCollection) {
        const newBalance = (nextCollection.balance || 0) - current.periodAmount;

        await db.collection("collections").updateOne(
          { referenceNumber: nextCollection.referenceNumber },
          { $set: { balance: newBalance } }
        );
      }
    }

    // 3. Update loan's total paidAmount and balance
    await db.collection("loans").updateOne(
      { loanId: current.loanId },
      {
        $inc: {
          paidAmount: amount,
          balance: -amount
        }
      }
    );

    res.json({
      message: "Payment recorded successfully",
      status: newStatus,
      paidAmount: updatedPaidAmount,
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
