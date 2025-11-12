const { padId } = require("../utils/generator");
const loanRepository = require("../repositories/loanRepository");
const { scheduleDueNotifications } = require("../services/borrowerNotif");

const createLoan = async (applicationId, db) => {
  const repo = loanRepository(db);

  // Fetch application
  const application = await repo.findApplicationById(applicationId);
  if (!application) throw new Error("Application not found");

  if (application.status !== "Active")
    throw new Error("Loan can only be generated for applications with status 'Active'");

  // Check if loan already exists
  const existingLoan = await repo.findExistingLoan(applicationId);
  if (existingLoan) throw new Error("Loan already exists for this application");

  // Check borrower
  if (!application.borrowersId)
    throw new Error("BorrowersId missing. Borrower account must be created first.");
  const borrower = await repo.findBorrowerById(application.borrowersId);
  if (!borrower) throw new Error("Borrower not found for the given borrowersId.");

  // Generate new loanId
  const maxLoan = await repo.getMaxLoan();
  let nextId = 1;
  if (maxLoan.length > 0 && !isNaN(maxLoan[0].loanIdNum)) nextId = maxLoan[0].loanIdNum + 1;
  const loanId = "L" + padId(nextId);

  // --- Store loan info ---
  const loan = {
    loanId,
    applicationId,
    borrowersId: borrower.borrowersId,
    profilePic: application.profilePic || "",
    paidAmount: 0,
    balance: application.appTotalPayable,
    status: "Active",
    loanType: application.loanType,
    dateDisbursed: application.dateDisbursed || new Date(),
    creditScore: 10,
    appInterestRate: Number(application.appInterestRate) || 0, 
    createdAt: new Date(),
  };

  await repo.insertLoan(loan);

  // --- Generate collection schedule ---
  let collections = [];
  const disbursedDate = new Date(application.dateDisbursed || new Date());

  if (application.loanType === "Open-Term Loan") {
    // Open-Term: one initial collection
    const interestRate = Number(application.appInterestRate) / 100;
    const monthlyDue = loan.balance + loan.balance * interestRate;

    const dueDate = new Date(disbursedDate);
    dueDate.setMonth(dueDate.getMonth() + 1);

    const collection = {
      referenceNumber: `${loanId}-C1`,
      loanId,
      borrowersId: borrower.borrowersId,
      name: borrower.name,
      collectionNumber: 1,
      dueDate,
      periodAmount: monthlyDue,
      paidAmount: 0,
      periodBalance: monthlyDue,
      loanBalance: loan.balance,
      status: "Unpaid",
      collector: borrower.assignedCollector || "",
      collectorId: borrower.assignedCollectorId,
      collectionNote: "Open-term initial collection",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    collections.push(collection);

  } else {
    // Fixed-Term: generate collections per term
    const termsInMonths = Number(application.appLoanTerms) || 0;
    const monthlyDue = Number(application.appMonthlyDue) || 0;
    let runningBalance = application.appTotalPayable;

    for (let i = 0; i < termsInMonths; i++) {
      const dueDate = new Date(disbursedDate);
      dueDate.setMonth(dueDate.getMonth() + i + 1);

      runningBalance -= monthlyDue;

      collections.push({
        referenceNumber: `${loanId}-C${i + 1}`,
        loanId,
        borrowersId: borrower.borrowersId,
        name: borrower.name,
        collectionNumber: i + 1,
        dueDate,
        periodAmount: monthlyDue,
        paidAmount: 0,
        periodBalance: monthlyDue,
        loanBalance: runningBalance > 0 ? runningBalance : 0,
        status: "Unpaid",
        collector: borrower.assignedCollector || "",
        collectorId: borrower.assignedCollectorId,
        note: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // --- Insert collections only if array is not empty ---
  if (collections.length > 0) {
    await repo.insertCollections(collections);
    await scheduleDueNotifications(db, collections);
  } else {
    console.warn(`No collections generated for loan ${loanId}. Check loan type or terms.`);
  }

  return loan;
};

module.exports = { createLoan };
