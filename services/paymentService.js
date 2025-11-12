const paymentRepository = require("../repositories/paymentRepository");
const { determineLoanStatus } = require("../utils/collection");
const { scheduleDueNotifications } = require("./borrowerNotif");
const axios = require("axios");
const { decrypt } = require("../utils/crypt"); 

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

// Helper to generate unique payment reference
const generatePaymentRef = (collectionRef) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${collectionRef}-P-${timestamp}-${random}`;
};

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

  await repo.incrementLoan(collection.loanId, { paidAmount: totalApplied, balance: -totalApplied });

  if (paymentLogs.length > 0) await repo.insertPayments(paymentLogs);

  const updatedLoan = await repo.findLoan(collection.loanId);

  if (updatedLoan.loanType === "Open-Term Loan") {
    await handleOpenTermRecalculation(db, updatedLoan, collection, totalApplied);
  }

  const updatedLoanCollections = await repo.findLoanCollections(collection.loanId);
  const loanStatus = determineLoanStatus(updatedLoanCollections);
  await repo.updateLoan(collection.loanId, { status: loanStatus });

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

const handleOpenTermRecalculation = async (db, loan, lastCollection, totalPaid) => {
  const repo = require("../repositories/paymentRepository")(db);

  const loanApp = await db.collection("loan_applications").findOne({ applicationId: loan.applicationId });
  if (!loanApp) throw new Error("Loan application not found");

  const interestRate = Number(loanApp.appInterestRate || 0) / 100;

  const interestDue = loan.balance * interestRate;
  const principalPayment = totalPaid > interestDue ? totalPaid - interestDue : 0;

  loan.balance = Math.max(loan.balance - principalPayment, 0);
  await repo.updateLoan(loan.loanId, { balance: loan.balance });

  // 4️⃣ Generate next collection if balance remains
  if (loan.balance > 0) {
    const nextDueDate = new Date(lastCollection.dueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const nextMonthlyDue = loan.balance + loan.balance * interestRate;

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




// Cash payment
const handleCashPayment = async (payload, db) => applyPayment({ ...payload, mode: "Cash" }, db);

// Handle PayMongo  success callback
const handlePaymongoSuccess = async (referenceNumber, db) => {
  const repo = paymentRepository(db);
  const paymongoPayment = await repo.findPaymongoPayment(referenceNumber);
  if (!paymongoPayment) throw new Error("PayMongo payment not found");

  const now = new Date();
  await repo.updatePaymongoPayment(referenceNumber, { status: "success", paidAt: now });

  // Apply the payment to collections/loan
  const result = await applyPayment({
    referenceNumber,
    amount: paymongoPayment.amount,
    mode: "Paymongo",
  }, db);

  // Fetch the borrower's assigned collector and name
  const borrower = await db.collection("borrowers_account").findOne(
    { borrowersId: paymongoPayment.borrowersId },
    { projection: { assignedCollectorId: 1, name: 1 } }
  );

  if (borrower?.assignedCollectorId) {
    const decryptedName = borrower.name ? decrypt(borrower.name) : "Unknown";
    const notifRepo = require("../repositories/notificationRepository")(db);

    await notifRepo.insertCollectorNotification({
      type: "paymongo-payment-received",
      title: "PayMongo Payment Received",
      message: `Payment of ${paymongoPayment.amount} via PayMongo for collection ${referenceNumber} has been received from ${decryptedName}.`,
      referenceNumber,
      actor: decryptedName,
      collectorId: borrower.assignedCollectorId,
      read: false,
      viewed: false,
      createdAt: now,
    });
  }

  return result;
};



// Create PayMongo GCash intent
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

const getPaymentsByBorrowers = async (borrowerIds, db) => {
  if (!Array.isArray(borrowerIds) || borrowerIds.length === 0) return [];

  const repo = paymentRepository(db);
  const payments = await repo.getPaymongoPaymentsByBorrowers(borrowerIds); 

  return payments.map((p) => ({
    referenceNumber: p.referenceNumber,
    amount: p.amount || 0,
    datePaid: p.datePaid || null,
    mode: p.mode,
    loanId: p.loanId,
    borrowersId: p.borrowersId,
    paidToCollection: p.paidToCollection,
  }));
};

const getPaymongoPaymentsWithNames = async (borrowerIds, db) => {
  if (!Array.isArray(borrowerIds) || borrowerIds.length === 0) return [];

  // Fetch only Paymongo payments for the borrowers
  const payments = await db
    .collection("payments")
    .find({ borrowersId: { $in: borrowerIds }, mode: "Paymongo" })
    .sort({ createdAt: -1 })
    .toArray();

  // Fetch borrower names
  const borrowers = await db
    .collection("borrowers_account")
    .find({ borrowersId: { $in: borrowerIds } })
    .project({ borrowersId: 1, name: 1 })
    .toArray();

  // Map borrowersId -> name
  const borrowerMap = borrowers.reduce((acc, b) => {
    acc[b.borrowersId] = b.name;
    return acc;
  }, {});

  // Attach decrypted name to payments
  return payments.map(p => ({
    ...p,
    name: borrowerMap[p.borrowersId] ? decrypt(borrowerMap[p.borrowersId]) : "Unknown",
  }));
};




module.exports = {
  handleCashPayment,
  createPaymongoGcash,
  handlePaymongoSuccess,
  getBorrowerPayments,
  getLoanLedger,
  getPaymentsByBorrowers,
  getPaymongoPaymentsWithNames
};
