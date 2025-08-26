const express = require('express');
const axios = require('axios');

const PAYMONGO_SECRET_KEY = 'sk_test_Q4rqE9GpwUrNxJeGXvdVCgY5'; 

module.exports = function (db) {
  const router = express.Router();

  
  router.post('/paymongo/gcash', async (req, res) => {
    const { amount, collectionNumber, referenceNumber, borrowersId } = req.body;

    if (!referenceNumber || !borrowersId || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    console.log("Creating PayMongo payment intent:", { amount, collectionNumber, referenceNumber, borrowersId });

    let paymentIntent;
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
              metadata: { referenceNumber, borrowersId },
            },
          },
        },
        { auth: { username: PAYMONGO_SECRET_KEY, password: '' } }
      );

      paymentIntent = paymentIntentRes.data.data;
      console.log("Payment intent created:", paymentIntent.id);
    } catch (err) {
      console.error("Failed creating payment intent:", err.response?.data || err.message);
      return res.status(500).json({ error: 'PayMongo payment intent failed' });
    }

   //GCASH SOURCE
    let checkoutUrl;
    try {
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

      checkoutUrl = sourceRes.data.data.attributes.redirect.checkout_url;
      console.log("GCash source created. Checkout URL:", checkoutUrl);

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
      console.error("Failed creating GCash source:", err.response?.data || err.message);
      return res.status(500).json({ error: 'PayMongo source creation failed' });
    }
  });

  //SUCCESS
  // PayMongo success callback
router.post('/:referenceNumber/paymongo/success', async (req, res) => {
  const { referenceNumber } = req.params;
  console.log("Payment success callback received for:", referenceNumber);

  try {
    const collection = await db.collection('collections').findOne({ referenceNumber });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });

    // 1️⃣ Mark collection as Paid
    await db.collection('collections').updateOne(
      { referenceNumber },
      { $set: { status: 'Paid', paidAt: new Date() } }
    );

    // 2️⃣ Update paymongo-payments collection
    await db.collection('paymongo-payments').updateOne(
      { referenceNumber },
      { $set: { status: 'paid', paidAt: new Date() } }
    );

    // 3️⃣ Update corresponding loan's paidAmount and balance
    const loan = await db.collection('loans').findOne({ loanId: collection.loanId });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const newPaidAmount = (loan.paidAmount || 0) + (collection.periodAmount || 0);
    const newBalance = (loan.totalPayable || 0) - newPaidAmount;

    await db.collection('loans').updateOne(
      { loanId: collection.loanId },
      { $set: { paidAmount: newPaidAmount, balance: newBalance } }
    );

    console.log(`Loan ${collection.loanId} updated: paidAmount=${newPaidAmount}, balance=${newBalance}`);
    res.json({ message: 'Payment successful, collection and loan updated' });

  } catch (err) {
    console.error('Error updating payment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  return router;
};
