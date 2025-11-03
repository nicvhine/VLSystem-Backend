const paymentRepository = require("../Repositories/paymentRepository");
const { determineLoanStatus } = require("../Utils/collection");
const axios = require("axios");

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

// Helper to generate unique payment reference
const generatePaymentRef = (collectionRef) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${collectionRef}-P-${timestamp}-${random}`;
};

// Unified payment handler for Cash and GCash
const applyPayment = async ({ referenceNumber, amount, collectorName, mode }, db) => {
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
    const periodRemaining = Math.max(due - alreadyPaid, 0);
    if (periodRemaining <= 0) continue;

    const paymentToApply = Math.min(remainingAmount, periodRemaining);
    const newPaidAmount = alreadyPaid + paymentToApply;

    // Update collection
    await repo.updateCollection(col.referenceNumber, {
      paidAmount: newPaidAmount,
      periodBalance: Math.max(due - newPaidAmount, 0),
      status: newPaidAmount >= due ? "Paid" : "Partial",
      loanBalance: Math.max((col.loanBalance || col.periodAmount) - paymentToApply, 0),
      mode,
      paidAt: now,
    });

    // Push payment log with unique payment reference
    paymentLogs.push({
      loanId: col.loanId,
      referenceNumber: generatePaymentRef(col.referenceNumber), 
      borrowersId: col.borrowersId,
      collector: collectorName || "Cash Collector",
      amount: paymentToApply,
      balance: Math.max(due - newPaidAmount, 0),
      paidToCollection: col.collectionNumber,
      mode,
      datePaid: now,
      createdAt: now,
    });

    remainingAmount -= paymentToApply;
  }

  const totalApplied = amount - remainingAmount;

  // Update loan's overall paidAmount and balance
  await repo.incrementLoan(collection.loanId, { paidAmount: totalApplied, balance: -totalApplied });

  // Insert payment logs
  if (paymentLogs.length > 0) await repo.insertPayments(paymentLogs);

  // Update loan status
  const updatedLoanCollections = await repo.findLoanCollections(collection.loanId);
  const loanStatus = determineLoanStatus(updatedLoanCollections);
  await repo.updateLoan(collection.loanId, { status: loanStatus });

  const borrowersId = paymentLogs[0]?.borrowersId || collection.borrowersId;
  const totalPaid = paymentLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

  return { 
    message: `${mode} payment applied successfully`, 
    borrowersId,
    amount: totalPaid,
    referenceNumber,
    paymentLogs, 
    remainingUnapplied: remainingAmount 
  };};

// Cash payment
const handleCashPayment = async (payload, db) => applyPayment({ ...payload, mode: "Cash" }, db);

// Handle PayMongo GCash success callback
const handlePaymongoSuccess = async (referenceNumber, db) => {
  const repo = paymentRepository(db);
  const paymongoPayment = await repo.findPaymongoPayment(referenceNumber);
  if (!paymongoPayment) throw new Error("PayMongo payment not found");

  const now = new Date();
  await repo.updatePaymongoPayment(referenceNumber, { status: "success", paidAt: now });

  return applyPayment({
    referenceNumber,
    amount: paymongoPayment.amount,
    mode: "GCash",
  }, db);
};

// Create PayMongo GCash intent & source
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

// Get ledger/payments for a specific loan
const getLoanLedger = async (loanId, db) => {
  const repo = paymentRepository(db);
  const payments = await repo.getPaymentsByLoan(loanId);  

  return payments.map(p => ({
    referenceNumber: p.referenceNumber,
    amount: p.amount || 0,
    datePaid: p.datePaid || null,
    mode: p.mode || "Cash",
    loanId: p.loanId,
    borrowersId: p.borrowersId,
    paidToCollection: p.paidToCollection,
  }));
};

// Get all payments for a borrower
const getBorrowerPayments = async (borrowersId, db) => {
  const repo = paymentRepository(db);
  const payments = await repo.getPaymentsByBorrower(borrowersId);

  return payments.map(p => ({
    referenceNumber: p.referenceNumber,
    amount: p.amount || 0,
    datePaid: p.datePaid || null,
    mode: p.mode || "Cash",
    loanId: p.loanId,
    borrowersId: p.borrowersId,
    paidToCollection: p.paidToCollection,
  }));
};

module.exports = {
  handleCashPayment,
  createPaymongoGcash,
  handlePaymongoSuccess,
  getBorrowerPayments,
  getLoanLedger,
};