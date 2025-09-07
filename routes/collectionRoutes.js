const express = require('express');
const router = express.Router();
const axios = require('axios');


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

      if (!current) return res.status(404).json({ error: "Collection not found." });

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

        // Update current collection
        await db.collection("collections").updateOne(
          { referenceNumber: collection.referenceNumber },
          {
            $set: {
              paidAmount: alreadyPaid + paymentToApply,
              balance: Math.max(due - (alreadyPaid + paymentToApply), 0),
              status: Math.max(due - (alreadyPaid + paymentToApply), 0) === 0 ? "Paid" : "Partial",
            }
          }
        );

        // Apply totalPayment to next collection if current fully paid
        if (alreadyPaid + paymentToApply >= due) {
          const nextCollection = await db.collection("collections").findOne({
            loanId: current.loanId,
            collectionNumber: collectionNumber + 1
          });

          if (nextCollection) {
            await db.collection("collections").updateOne(
              { referenceNumber: nextCollection.referenceNumber },
              { $inc: { totalPayment: paymentToApply, loanBalance: -paymentToApply } }
            );
          }
        }

        // Log payment
        paymentLogs.push({
          loanId: current.loanId,
          referenceNumber: collection.referenceNumber,
          borrowersId: current.borrowersId,
          collector: current.collector || null,
          amount: paymentToApply,
          balance: Math.max(due - (alreadyPaid + paymentToApply), 0),
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
        { $inc: { paidAmount: amount - remainingAmount, balance: -(amount - remainingAmount) } }
      );

      // Save payment logs
      if (paymentLogs.length > 0) {
        await db.collection("payments").insertMany(paymentLogs);

        const successNote = {
          id: `success-${paymentLogs[0].referenceNumber}-${Date.now()}`,
          message: `✅ Payment of ₱${(amount - remainingAmount).toFixed(2)} was successfully recorded.`,
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
        totalPaid: amount - remainingAmount,
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

  router.post('/:referenceNumber/paymongo', async (req, res) => {
    const { referenceNumber } = req.params;
    const { amount, currency } = req.body; // amount in pesos, currency e.g., 'PHP'

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount." });
    }

    try {
      // Fetch collection and loan info
      const collection = await db.collection('collections').findOne({ referenceNumber });
      if (!collection) return res.status(404).json({ error: "Collection not found." });

      const loan = await db.collection('loans').findOne({ loanId: collection.loanId });
      if (!loan) return res.status(404).json({ error: "Loan not found." });

      // PayMongo secret key from environment
      const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
      const authHeader = `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`;

      // Create Payment Intent
      const paymentIntentRes = await axios.post(
        'https://api.paymongo.com/v1/payment_intents',
        {
          data: {
            attributes: {
              amount: Math.round(amount * 100), // in centavos
              currency: currency.toLowerCase(),
              payment_method_allowed: ['gcash'],
              description: `Loan ${loan.loanId} - Collection ${collection.collectionNumber}`,
            },
          },
        },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
      );

      const paymentIntent = paymentIntentRes.data.data;

      // Create GCash source for redirect
      const sourceRes = await axios.post(
        'https://api.paymongo.com/v1/sources',
        {
          data: {
            attributes: {
              type: 'gcash',
              amount: Math.round(amount * 100),
              currency: currency.toLowerCase(),
              redirect: {
                success: `http://localhost:3000/components/borrower/payment-success/${referenceNumber}`,
                failed: `http://localhost:3000/borrower/payment-failed/${referenceNumber}`,
              },
              payment_intent: paymentIntent.id,
              statement_descriptor: `Loan ${loan.loanId} - Collection ${collection.collectionNumber}`,
            },
          },
        },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
      );

      const checkoutUrl = sourceRes.data.data.attributes.redirect.checkout_url;

      res.json({ checkout_url: checkoutUrl });
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(500).json({ error: 'Failed to create PayMongo payment' });
    }
  });


router.get("/collection-stats", async (req, res) => {
  try {
    const result = await db.collection("collections").aggregate([
      {
        $group: {
          _id: null,
          totalCollectables: { $sum: "$periodAmount" },
          totalCollected: { $sum: "$totalPaidAmount" }
        }
      }
    ]).toArray();

    const totalCollectables = result[0]?.totalCollectables || 0;
    const totalCollected = result[0]?.totalCollected || 0;
    const totalUnpaid = totalCollectables - totalCollected;

    res.json({
    totalCollectables,
    totalCollected,
    totalUnpaid,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch collection stats" });
  }
});

  return router;
};