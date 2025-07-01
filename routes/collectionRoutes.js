const express = require('express');
const router = express.Router();

module.exports = (db) => {
// GET COLLECTIONS
router.get('/', async (req, res) => {
  const collectorName = req.query.collector;
  const query = collectorName ? { collector: collectorName } : {};

  try {
    const collections = await db.collection('collections').find(query).toArray();

    const loanIds = [...new Set(collections.map(c => c.loanId))];
    const loans = await db.collection('loans')
      .find({ loanId: { $in: loanIds } })
      .project({ loanId: 1, balance: 1 })
      .toArray();

    const loanBalanceMap = {};
    loans.forEach(loan => {
      loanBalanceMap[loan.loanId] = loan.balance;
    });

    const withLoanBalance = collections.map(c => ({
      ...c,
      loanBalance: loanBalanceMap[c.loanId] ?? null,
      totalPayment: (c.paidAmount || 0) + (c.balance || 0),
    }));

    res.json(withLoanBalance);
  } catch (err) {
    console.error("Error loading collections with loan balance:", err);
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
    const current = await db.collection("collections").findOne({ referenceNumber });

    if (!current) {
      return res.status(404).json({ error: "Collection not found." });
    }

    const updatedPaidAmount = (current.paidAmount || 0) + amount;
    const balanceRemaining = Math.max(current.periodAmount - updatedPaidAmount, 0);
    const isPaid = updatedPaidAmount >= current.periodAmount;
    const newStatus = isPaid ? 'Paid' : 'Partial';

    const overpayment = updatedPaidAmount - current.periodAmount;

    // 1. Update current collection document
    await db.collection("collections").updateOne(
      { referenceNumber },
      {
        $set: {
          paidAmount: updatedPaidAmount,
          balance: balanceRemaining,
          status: newStatus,
          note: isPaid ? '' : (current.note || ''),
        }
      }
    );

    // 2. Apply overpayment to next collection(s)
    let remainingOverpayment = overpayment;

    let nextCollectionNumber = current.collectionNumber + 1;

    while (remainingOverpayment > 0) {
      const nextCollection = await db.collection("collections").findOne({
        loanId: current.loanId,
        collectionNumber: nextCollectionNumber,
      });

      if (!nextCollection) break;

      const nextBalance = nextCollection.balance || nextCollection.periodAmount;
      const paymentToApply = Math.min(remainingOverpayment, nextBalance);
      const newPaid = (nextCollection.paidAmount || 0) + paymentToApply;
      const newBal = nextBalance - paymentToApply;

      await db.collection("collections").updateOne(
        { referenceNumber: nextCollection.referenceNumber },
        {
          $set: {
            paidAmount: newPaid,
            balance: newBal,
            status: newBal === 0 ? 'Paid' : 'Partial',
          }
        }
      );

      remainingOverpayment -= paymentToApply;
      nextCollectionNumber++;
    }

    // 3. Update loan's paidAmount and balance
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
      overpaymentUsed: overpayment - remainingOverpayment,
      remainingOverpayment
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
