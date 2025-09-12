require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || 'sk_test_Q4rqE9GpwUrNxJeGXvdVCgY5';
const uri = process.env.MONGODB_URI;

module.exports = function (db) {
  const router = express.Router();

  // ✅ Helper: safely create ObjectId
  function createObjectId(id) {
    try {
      if (ObjectId.isValid(id)) return new ObjectId(id);
      return null;
    } catch (error) {
      console.error('Invalid ObjectId:', error);
      return null;
    }
  }

  // ✅ PayMongo GCash Payment (create intent + source)
  router.post('/paymongo/gcash', async (req, res) => {
    const { amount, collectionNumber, referenceNumber, borrowersId } = req.body;

    if (!referenceNumber || !borrowersId || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    try {
      // 1️⃣ Create payment intent
      const paymentIntentRes = await axios.post(
        'https://api.paymongo.com/v1/payment_intents',
        {
          data: {
            attributes: {
              amount: Math.round(amount * 100),
              currency: 'PHP',
              payment_method_allowed: ['gcash'],
              description: `Payment for collection ${collectionNumber}`,
              metadata: { referenceNumber, borrowersId },
            },
          },
        },
        { auth: { username: PAYMONGO_SECRET_KEY, password: '' } }
      );

      const paymentIntent = paymentIntentRes.data.data;

      // 2️⃣ Create GCash source
      const sourceRes = await axios.post(
        'https://api.paymongo.com/v1/sources',
        {
          data: {
            attributes: {
              type: 'gcash',
              amount: Math.round(amount * 100),
              currency: 'PHP',
              redirect: {
                success: `http://localhost:3000/components/borrower/payment-success/${referenceNumber}`,
                failed: `http://localhost:3000/borrower/payment-failed/${referenceNumber}`,
              },
              payment_intent: paymentIntent.id,
              statement_descriptor: `Collection ${collectionNumber}`,
              metadata: { referenceNumber, borrowersId },
            },
          },
        },
        { auth: { username: PAYMONGO_SECRET_KEY, password: '' } }
      );

      const checkoutUrl = sourceRes.data.data.attributes.redirect.checkout_url;

      // 3️⃣ Save pending record
      await db.collection('paymongo-payments').insertOne({
        referenceNumber,
        collectionNumber,
        borrowersId,
        amount,
        paymentIntentId: paymentIntent.id,
        sourceId: sourceRes.data.data.id,
        status: 'pending',
        createdAt: new Date(),
      });

      res.json({ checkout_url: checkoutUrl });
    } catch (err) {
      console.error("PayMongo error:", err.response?.data || err.message);
      return res.status(500).json({ error: 'PayMongo payment failed' });
    }
  });

  // ✅ PayMongo success callback
  router.post('/:referenceNumber/paymongo/success', async (req, res) => {
    const { referenceNumber } = req.params;

    try {
      const collection = await db.collection('collections').findOne({ referenceNumber });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      // Update collection
      await db.collection('collections').updateOne(
        { referenceNumber },
        { $set: { status: 'Paid', paidAt: new Date() } }
      );

      // Update paymongo-payments
      await db.collection('paymongo-payments').updateOne(
        { referenceNumber },
        { $set: { status: 'paid', paidAt: new Date() } }
      );

      // Update loan
      const loan = await db.collection('loans').findOne({ loanId: collection.loanId });
      if (!loan) return res.status(404).json({ error: 'Loan not found' });

      const newPaidAmount = (loan.paidAmount || 0) + (collection.periodAmount || 0);
      const newBalance = (loan.totalPayable || 0) - newPaidAmount;

      await db.collection('loans').updateOne(
        { loanId: collection.loanId },
        { $set: { paidAmount: newPaidAmount, balance: newBalance } }
      );

      // Insert into payments ledger
      await db.collection('payments').insertOne({
        loanId: collection.loanId,
        referenceNumber,
        borrowersId: collection.borrowersId,
        collector: "PayMongo",
        amount: collection.periodAmount,
        balance: newBalance,
        datePaid: new Date(),
        status: "Paid",
        mode: "GCash",
        createdAt: new Date()
      });

      res.json({ message: 'Payment successful, records updated' });
    } catch (err) {
      console.error('Error updating PayMongo payment:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ Cash payment route
  router.post('/:referenceNumber/cash', async (req, res) => {
    const { referenceNumber } = req.params;
    const { collectorName } = req.body;

    try {
      const collection = await db.collection('collections').findOne({ referenceNumber });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      // Update collection
      await db.collection('collections').updateOne(
        { referenceNumber },
        { $set: { status: 'Paid', paidAt: new Date() } }
      );

      // Update loan
      const loan = await db.collection('loans').findOne({ loanId: collection.loanId });
      if (!loan) return res.status(404).json({ error: 'Loan not found' });

      const newPaidAmount = (loan.paidAmount || 0) + (collection.periodAmount || 0);
      const newBalance = (loan.totalPayable || 0) - newPaidAmount;

      await db.collection('loans').updateOne(
        { loanId: collection.loanId },
        { $set: { paidAmount: newPaidAmount, balance: newBalance } }
      );

      // Insert into payments ledger
      await db.collection('payments').insertOne({
        loanId: collection.loanId,
        referenceNumber,
        borrowersId: collection.borrowersId,
        collector: collectorName || "Cash Collector",
        amount: collection.periodAmount,
        balance: newBalance,
        datePaid: new Date(),
        status: "Paid",
        mode: "Cash",
        createdAt: new Date()
      });

      res.json({ message: 'Cash payment successful, records updated' });
    } catch (err) {
      console.error('Error handling cash payment:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ Get payment ledger
  router.get('/ledger/:loanId', async (req, res) => {
    try {
      const { loanId } = req.params;

      const cashPayments = await db.collection('payments')
        .find({ loanId: loanId })
        .sort({ datePaid: -1 })
        .toArray();

      const paymongoPayments = await db.collection('paymongo-payments')
        .find({ borrowersId: loanId })
        .sort({ createdAt: -1 })
        .toArray();

      const normalizedCash = cashPayments.map(p => ({
        ...p,
        _id: p._id ? p._id.toString() : null,
        mode: p.mode || "Cash"
      }));

      const normalizedPaymongo = paymongoPayments.map(p => ({
        ...p,
        _id: p._id ? p._id.toString() : null,
        datePaid: p.paidAt || p.createdAt,
        mode: "PayMongo"
      }));

      const mergedPayments = [...normalizedCash, ...normalizedPaymongo].sort(
        (a, b) => new Date(a.datePaid).getTime() - new Date(b.datePaid).getTime()
      );

      res.json({ success: true, payments: mergedPayments });
    } catch (error) {
      console.error('Ledger error:', error);
      res.status(500).json({ success: false, message: 'Failed to get ledger' });
    }
  });

  return router;
};
