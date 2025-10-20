const paymentRepository = require("../Repositories/paymentRepository");
const { determineLoanStatus } = require("../Utils/collection");
const axios = require("axios");

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY; 

//Apply cash payment
const handleCashPayment = async ({ referenceNumber, amount, collectorName }, db) => {
  if (!amount || isNaN(amount) || amount <= 0) throw new Error("Invalid payment amount");

  const repo = paymentRepository(db);
  const now = new Date();

  const collection = await repo.findCollection(referenceNumber);
  if (!collection) throw new Error("Collection not found");

  const loanCollections = await repo.findLoanCollections(collection.loanId);
  let remainingAmount = amount;
  const paymentLogs = [];

  for (let col of loanCollections) {
    if (remainingAmount <= 0) break;

    const due = col.periodAmount || 0;
    const alreadyPaid = col.paidAmount || 0;
    const balance = Math.max(due - alreadyPaid, 0);
    if (balance <= 0) continue;

    const paymentToApply = Math.min(remainingAmount, balance);
    const newPaidAmount = alreadyPaid + paymentToApply;

    await repo.updateCollection(col.referenceNumber, {
      paidAmount: newPaidAmount,
      status: newPaidAmount >= due ? "Paid" : "Partial",
      balance: Math.max(due - newPaidAmount, 0),
      mode: "Cash",
      paidAt: now,
    });

    paymentLogs.push({
      loanId: col.loanId,
      referenceNumber: col.referenceNumber,
      borrowersId: col.borrowersId,
      collector: collectorName || "Cash Collector",
      amount: paymentToApply,
      balance: Math.max(due - newPaidAmount, 0),
      paidToCollection: col.collectionNumber,
      mode: "Cash",
      datePaid: now,
      createdAt: now,
    });

    remainingAmount -= paymentToApply;
  }

  const totalApplied = amount - remainingAmount;
  await repo.incrementLoan(collection.loanId, { paidAmount: totalApplied, balance: -totalApplied });

  if (paymentLogs.length > 0) await repo.insertPayments(paymentLogs);

  const updatedLoanCollections = await repo.findLoanCollections(collection.loanId);
  const loanStatus = determineLoanStatus(updatedLoanCollections);
  await repo.updateLoan(collection.loanId, { status: loanStatus });

  return { message: "Cash payment applied successfully", paymentLogs, remainingUnapplied: remainingAmount };
};

/**
 * Create PayMongo GCash intent & source
 */
const createPaymongoGcash = async ({ amount, collectionNumber, referenceNumber, borrowersId }, db) => {
  if (!referenceNumber || !borrowersId || !amount || amount <= 0) {
    throw new Error("Invalid request payload");
  }

  const paymentIntentRes = await axios.post(
    "https://api.paymongo.com/v1/payment_intents",
    {
      data: {
        attributes: {
          amount: Math.round(amount * 100),
          currency: "PHP",
          payment_method_allowed: ["gcash"],
          description: `Payment for collection ${collectionNumber}`,
          metadata: { referenceNumber, borrowersId },
        },
      },
    },
    { auth: { username: PAYMONGO_SECRET_KEY, password: "" } }
  );

  const paymentIntent = paymentIntentRes.data.data;

  const sourceRes = await axios.post(
    "https://api.paymongo.com/v1/sources",
    {
      data: {
        attributes: {
          type: "gcash",
          amount: Math.round(amount * 100),
          currency: "PHP",
          redirect: {
            success: `http://localhost:3000/userPage/borrowerPage/payMongoTools/payment-success/${referenceNumber}`,
            failed: `http://localhost:3000/borrower/payment-failed/${referenceNumber}`,
          },
          payment_intent: paymentIntent.id,
          statement_descriptor: `Collection ${collectionNumber}`,
          metadata: { referenceNumber, borrowersId },
        },
      },
    },
    { auth: { username: PAYMONGO_SECRET_KEY, password: "" } }
  );

  const checkoutUrl = sourceRes.data.data.attributes.redirect.checkout_url;

  await db.collection("paymongo-payments").insertOne({
    referenceNumber,
    collectionNumber,
    borrowersId,
    amount,
    paymentIntentId: paymentIntent.id,
    sourceId: sourceRes.data.data.id,
    status: "pending",
    createdAt: new Date(),
  });

  return { checkout_url: checkoutUrl };
};

/**
 * Handle PayMongo success callback
 */
const handlePaymongoSuccess = async (referenceNumber, db) => {
  const repo = paymentRepository(db);
  const now = new Date();

  const paymongoPayment = await repo.findPaymongoPayment(referenceNumber);
  if (!paymongoPayment) throw new Error("PayMongo payment not found");

  await repo.updatePaymongoPayment(referenceNumber, { status: "success", paidAt: now });

  const collection = await repo.findCollection(referenceNumber);
  if (!collection) throw new Error("Collection not found");

  const loanCollections = await repo.findLoanCollections(collection.loanId);
  let remainingAmount = paymongoPayment.amount;
  const paymentLogs = [];

  for (let col of loanCollections) {
    if (remainingAmount <= 0) break;

    const due = col.periodAmount || 0;
    const alreadyPaid = col.paidAmount || 0;
    const balance = Math.max(due - alreadyPaid, 0);
    if (balance <= 0) continue;

    const paymentToApply = Math.min(remainingAmount, balance);
    const newPaidAmount = alreadyPaid + paymentToApply;

    await repo.updateCollection(col.referenceNumber, {
      paidAmount: newPaidAmount,
      status: newPaidAmount >= due ? "Paid" : "Partial",
      balance: Math.max(due - newPaidAmount, 0),
      mode: "GCash",
      paidAt: now,
    });

    paymentLogs.push({
      loanId: col.loanId,
      referenceNumber: col.referenceNumber,
      borrowersId: col.borrowersId,
      amount: paymentToApply,
      balance: Math.max(due - newPaidAmount, 0),
      paidToCollection: col.collectionNumber,
      mode: "GCash",
      datePaid: now,
      createdAt: now,
    });

    remainingAmount -= paymentToApply;
  }

  const totalApplied = paymongoPayment.amount - remainingAmount;
  await repo.incrementLoan(collection.loanId, { paidAmount: totalApplied, balance: -totalApplied });

  if (paymentLogs.length > 0) await repo.insertPayments(paymentLogs);

  const updatedLoanCollections = await repo.findLoanCollections(collection.loanId);
  const loanStatus = determineLoanStatus(updatedLoanCollections);
  await repo.updateLoan(collection.loanId, { status: loanStatus });

  return { message: `GCash payment successful for ${referenceNumber}`, paymentLogs };
};

module.exports = {
  handleCashPayment,
  createPaymongoGcash,
  handlePaymongoSuccess,
};
