const paymentRepository = require("../repositories/paymentRepository");
const { determineLoanStatus } = require("../utils/collection");
const { scheduleDueNotifications } = require("./borrowerNotif");
const axios = require("axios");

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

// Helper to generate unique payment reference
const generatePaymentRef = (collectionRef) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${collectionRef}-P-${timestamp}-${random}`;
};

// 🔹 Unified payment handler (Cash / GCash)
const applyPayment = async ({ referenceNumber, amount, collectorName, mode }, db) => {
  if (!amount || isNaN(amount) || amount <= 0) throw new Error("Invalid payment amount");

  const repo = paymentRepository(db);
  const now = new Date();

  // Get current collection
  const collection = await repo.findCollection(referenceNumber);
  if (!collection) throw new Error("Collection not found");

  // Get loan info
  const loan = await repo.findLoan(collection.loanId);
  if (!loan) throw new Error("Loan not found");

  // Get all collections for this loan
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

    // Save payment log
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

  // 🔹 Update loan balance
  await repo.incrementLoan(collection.loanId, { paidAmount: totalApplied, balance: -totalApplied });

  // 🔹 Insert payment logs
  if (paymentLogs.length > 0) await repo.insertPayments(paymentLogs);

  // Fetch updated loan
  const updatedLoan = await repo.findLoan(collection.loanId);

  // 🔹 Handle Open-Term logic
  if (updatedLoan.loanType === "Open-Term Loan") {
    await handleOpenTermRecalculation(db, updatedLoan, collection, totalApplied);
  }

  // 🔹 Update loan status
  const updatedLoanCollections = await repo.findLoanCollections(collection.loanId);
  const loanStatus = determineLoanStatus(updatedLoanCollections);
  await repo.updateLoan(collection.loanId, { status: loanStatus });

  // 🔹 If balance is fully paid
  if (updatedLoan.balance <= 0) {
    await repo.updateLoan(updatedLoan.loanId, { status: "Completed" });
  }

  const borrowersId = paymentLogs[0]?.borrowersId || collection.borrowersId;
  const totalPaid = paymentLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

  return {
    message: `${mode} payment applied successfully`,
    borrowersId,
    amount: totalPaid,
    referenceNumber,
    paymentLogs,
    remainingUnapplied: remainingAmount,
  };
};

// 🔁 Recalculate & generate next collection for Open-Term Loan
const handleOpenTermRecalculation = async (db, loan, lastCollection, totalPaid) => {
  const repo = require("../repositories/paymentRepository")(db);

  // 1️⃣ Fetch the loan application
  const loanApp = await db.collection("loan_applications").findOne({ applicationId: loan.applicationId });
  if (!loanApp) throw new Error("Loan application not found");

  const interestRate = Number(loanApp.appInterestRate || 0) / 100;

  // 2️⃣ Compute interest & principal
  const interestDue = loan.balance * interestRate;
  const principalPayment = totalPaid > interestDue ? totalPaid - interestDue : 0;

  // 3️⃣ Update remaining balance
  loan.balance = Math.max(loan.balance - principalPayment, 0);
  await repo.updateLoan(loan.loanId, { balance: loan.balance });

  // 4️⃣ Generate next collection if balance remains
  if (loan.balance > 0) {
    const nextDueDate = new Date(lastCollection.dueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const nextMonthlyDue = loan.balance * interestRate;

    const nextCollection = {
      referenceNumber: `${loan.loanId}-C${lastCollection.collectionNumber + 1}`,
      loanId: loan.loanId,
      borrowersId: loan.borrowersId,
      name: lastCollection.name,
      collectionNumber: lastCollection.collectionNumber + 1,
      dueDate: nextDueDate,
      periodAmount: nextMonthlyDue,
      paidAmount: 0,
      periodBalance: nextMonthlyDue,
      loanBalance: loan.balance,
      status: "Unpaid",
      collector: lastCollection.collector,
      collectorId: lastCollection.collectorId,
      note: "Auto-generated for Open-Term Loan",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await repo.insertCollections([nextCollection]);
    await scheduleDueNotifications(db, [nextCollection]);
  } else {
    await repo.updateLoan(loan.loanId, { status: "Completed" });
  }
};




// 🔹 Cash payment
const handleCashPayment = async (payload, db) => applyPayment({ ...payload, mode: "Cash" }, db);

// 🔹 Handle PayMongo GCash success callback
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

// 🔹 Create PayMongo GCash intent
const createPaymongoGcash = async ({ amount, collectionNumber, referenceNumber, borrowersId }, db) => {
  if (!referenceNumber || !borrowersId || !amount || amount <= 0)
    throw new Error("Invalid request payload");

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

// 🔹 Get loan ledger/payments
const getLoanLedger = async (loanId, db) => {
  const repo = paymentRepository(db);
  const payments = await repo.getPaymentsByLoan(loanId);
  return payments.map((p) => ({
    referenceNumber: p.referenceNumber,
    amount: p.amount || 0,
    datePaid: p.datePaid || null,
    mode: p.mode || "Cash",
    loanId: p.loanId,
    borrowersId: p.borrowersId,
    paidToCollection: p.paidToCollection,
  }));
};

// 🔹 Get borrower payment history
const getBorrowerPayments = async (borrowersId, db) => {
  const repo = paymentRepository(db);
  const payments = await repo.getPaymentsByBorrower(borrowersId);
  return payments.map((p) => ({
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
