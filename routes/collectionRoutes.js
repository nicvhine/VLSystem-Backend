const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // GET payment schedule for a borrower and loan
  router.get('/schedule/:borrowersId/:loanId', async (req, res) => {
    const { borrowersId, loanId } = req.params;
    try {
      const collectionsCol = db.collection('collections');
      const schedule = await collectionsCol.find({ borrowersId, loanId }).sort({ collectionNumber: 1 }).toArray();
      if (!schedule || schedule.length === 0) {
        return res.status(404).json({ error: 'No payment schedule found for this borrower and loan.' });
      }
      res.json(schedule);
    } catch (err) {
      console.error('Error fetching payment schedule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET COLLECTIONS
  router.get('/', async (req, res) => {
    try {
      // due date notifications (within 3 days)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);

      const collectionsCol = db.collection('collections');
      const notificationsCol = db.collection('notifications');

      const upcoming = await collectionsCol.find({
        status: 'Unpaid',
        dueDate: { $gte: today, $lte: threeDaysLater }
      }).toArray();

      const existingDueRefs = (
        await notificationsCol.find({ type: 'due' }).toArray()
      ).map(n => n.referenceNumber);

      const newNotifs = upcoming
        .filter(c => !existingDueRefs.includes(c.referenceNumber))
        .map(c => ({
          id: `due-${c.referenceNumber}`,
          message: `📅 Payment due for Collection ${c.collectionNumber}`,
          referenceNumber: c.referenceNumber,
          borrowersId: c.borrowersId,
          date: c.dueDate,
          viewed: false,
          type: 'due',
          createdAt: new Date()
        }));

      if (newNotifs.length > 0) {
        await notificationsCol.insertMany(newNotifs);
      }

      const collectorName = req.query.collector;
      const query = collectorName ? { collector: collectorName } : {};

      const collections = await collectionsCol.find(query).sort({ collectionNumber: 1 }).toArray();

      const loanIds = [...new Set(collections.map(c => c.loanId))];
      const loans = await db.collection('loans').find({ loanId: { $in: loanIds } }).toArray();

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

      if (!loan) {
        console.warn(`Loan not found for loanId: ${loanId}, skipping collections.`);
        continue;
      }

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

  // MAKE PAYMENT
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

      // Update loan
      await db.collection("loans").updateOne(
        { loanId: current.loanId },
        {
          $inc: {
            paidAmount: amount,
            balance: -amount
          }
        }
      );

      // Save logs
      await db.collection("payments").insertMany(paymentLogs);

      // Save notification
      if (paymentLogs.length > 0) {
        const successNote = {
          id: `success-${paymentLogs[0].referenceNumber}-${Date.now()}`,
          message: `✅ Payment of ₱${amount.toFixed(2)} was successfully recorded.`,
          referenceNumber: paymentLogs[0].referenceNumber,
          borrowersId: paymentLogs[0].borrowersId,
          date: new Date(),
          viewed: false
        };

        await db.collection('notifications').insertOne(successNote);
      }

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