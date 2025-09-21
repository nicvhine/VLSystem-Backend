require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { ObjectId } = require('mongodb');
const { applyOverduePenalty, determineLoanStatus } = require('../utils/collection');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || 'sk_test_Q4rqE9GpwUrNxJeGXvdVCgY5';

module.exports = function (db) {
  const router = express.Router();

  // CASH PAYMENT
  router.post('/:referenceNumber/cash', async (req, res) => {
    const { referenceNumber } = req.params;
    const { amount, collectorName } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    try {
      const now = new Date();
      const collection = await db.collection('collections').findOne({ referenceNumber });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      const loanCollections = await db.collection('collections')
        .find({ loanId: collection.loanId })
        .sort({ collectionNumber: 1 })
        .toArray();

      let remainingAmount = amount;
      const paymentLogs = [];

      for (let col of loanCollections) {
        if (remainingAmount <= 0) break;

        const updatedCol = applyOverduePenalty(col);
        if (updatedCol.status === 'Overdue' && col.status !== 'Overdue') {
          await db.collection('collections').updateOne(
            { referenceNumber: col.referenceNumber },
            { $set: { status: 'Overdue', penalty: updatedCol.penalty, balance: updatedCol.balance } }
          );
          col = updatedCol;
        }

        const due = (col.periodAmount || 0) + (col.penalty || 0);
        const alreadyPaid = col.paidAmount || 0;
        const balance = Math.max(due - alreadyPaid, 0);

        if (balance <= 0) continue;

        const paymentToApply = Math.min(remainingAmount, balance);
        const newPaidAmount = alreadyPaid + paymentToApply;

        await db.collection('collections').updateOne(
          { referenceNumber: col.referenceNumber },
          {
            $set: {
              paidAmount: newPaidAmount,
              status: newPaidAmount >= due ? 'Paid' : 'Partial',
              balance: Math.max(due - newPaidAmount, 0),
              mode: 'Cash',
              paidAt: now
            }
          }
        );

        paymentLogs.push({
          loanId: col.loanId,
          referenceNumber: col.referenceNumber,
          borrowersId: col.borrowersId,
          collector: collectorName || 'Cash Collector',
          amount: paymentToApply,
          balance: Math.max(due - newPaidAmount, 0),
          paidToCollection: col.collectionNumber,
          mode: 'Cash',
          datePaid: now,
          createdAt: now
        });

        remainingAmount -= paymentToApply;
      }

      const totalApplied = amount - remainingAmount;

      await db.collection('loans').updateOne(
        { loanId: collection.loanId },
        { $inc: { paidAmount: totalApplied, balance: -totalApplied } }
      );

      if (paymentLogs.length > 0) {
        await db.collection('payments').insertMany(paymentLogs);
      }

      const updatedLoanCollections = await db.collection('collections').find({ loanId: collection.loanId }).toArray();
      const loanStatus = determineLoanStatus(updatedLoanCollections);

      await db.collection('loans').updateOne({ loanId: collection.loanId }, { $set: { status: loanStatus } });

      res.json({ message: 'Cash payment successful, penalties applied if overdue', paymentLogs, remainingUnapplied: remainingAmount });

    } catch (err) {
      console.error('Error handling cash payment:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GCASH PAYMENT
  router.post('/paymongo/gcash', async (req, res) => {
    const { amount, collectionNumber, referenceNumber, borrowersId } = req.body;

    if (!referenceNumber || !borrowersId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    try {
      const paymentIntentRes = await axios.post(
        'https://api.paymongo.com/v1/payment_intents',
        {
          data: {
            attributes: {
              amount: Math.round(amount * 100),
              currency: 'PHP',
              payment_method_allowed: ['gcash'],
              description: `Payment for collection ${collectionNumber}`,
              metadata: { referenceNumber, borrowersId }
            }
          }
        },
        { auth: { username: PAYMONGO_SECRET_KEY, password: '' } }
      );

      const paymentIntent = paymentIntentRes.data.data;

      const sourceRes = await axios.post(
        'https://api.paymongo.com/v1/sources',
        {
          data: {
            attributes: {
              type: 'gcash',
              amount: Math.round(amount * 100),
              currency: 'PHP',
              redirect: {
                success: `http://localhost:3000/userPage/borrowerPage/payMongoTools/payment-success/${referenceNumber}`,
                failed: `http://localhost:3000/borrower/payment-failed/${referenceNumber}`
              },
              payment_intent: paymentIntent.id,
              statement_descriptor: `Collection ${collectionNumber}`,
              metadata: { referenceNumber, borrowersId }
            }
          }
        },
        { auth: { username: PAYMONGO_SECRET_KEY, password: '' } }
      );

      const checkoutUrl = sourceRes.data.data.attributes.redirect.checkout_url;

      await db.collection('paymongo-payments').insertOne({
        referenceNumber,
        collectionNumber,
        borrowersId,
        amount,
        paymentIntentId: paymentIntent.id,
        sourceId: sourceRes.data.data.id,
        status: 'pending',
        createdAt: new Date()
      });

      res.json({ checkout_url: checkoutUrl });

    } catch (err) {
      console.error('PayMongo error:', err.response?.data || err.message);
      res.status(500).json({ error: 'PayMongo payment failed' });
    }
  });

  // PAYMENTS LEDGER BY LOAN
  router.get('/ledger/:loanId', async (req, res) => {
    const { loanId } = req.params;

    try {
      const cashPayments = await db.collection('payments')
        .find({ loanId })
        .sort({ datePaid: -1 })
        .toArray();

      const paymongoPayments = await db.collection('paymongo-payments')
        .find({ loanId }) // FIXED: use loanId, not borrowersId
        .sort({ createdAt: -1 })
        .toArray();

      const normalizedCash = cashPayments.map(p => ({ ...p, _id: p._id?.toString(), mode: 'Cash' }));
      const normalizedPaymongo = paymongoPayments.map(p => ({
        ...p,
        _id: p._id?.toString(),
        datePaid: p.paidAt || p.createdAt,
        mode: 'PayMongo'
      }));

      const mergedPayments = [...normalizedCash, ...normalizedPaymongo]
        .sort((a, b) => new Date(a.datePaid).getTime() - new Date(b.datePaid).getTime());

      res.json({ success: true, payments: mergedPayments });
    } catch (err) {
      console.error('Ledger error:', err);
      res.status(500).json({ success: false, message: 'Failed to get ledger' });
    }
  });

 // Fetch payments for a borrower
  router.get('/:borrowersId', async (req, res) => {
    const { borrowersId } = req.params;

    try {
      const payments = await db.collection('payments')
        .find({ borrowersId })
        .sort({ datePaid: -1 }) // optional, remove if you want unsorted
        .toArray();

      res.json(payments); // send exactly what’s in the database
    } catch (err) {
      console.error('Error fetching payments:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });


  return router;
};
