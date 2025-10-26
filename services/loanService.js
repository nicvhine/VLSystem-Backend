const { padId } = require("../Utils/generator");
const loanRepository = require("../Repositories/loanRepository");

// Create a loan and generate its collection schedule
const createLoan = async (applicationId, db) => {
  const repo = loanRepository(db);

  const application = await repo.findApplicationById(applicationId);
  if (!application) throw new Error("Application not found");

  if (application.status !== "Active")
    throw new Error("Loan can only be generated for applications with status 'Active'");

  const existingLoan = await repo.findExistingLoan(applicationId);
  if (existingLoan) throw new Error("Loan already exists for this application");

  if (!application.borrowersId)
    throw new Error("BorrowersId missing. Borrower account must be created first.");

  const borrower = await repo.findBorrowerById(application.borrowersId);
  if (!borrower) throw new Error("Borrower not found for the given borrowersId.");

  // Generate new loanId
  const maxLoan = await repo.getMaxLoan();
  let nextId = 1;
  if (maxLoan.length > 0 && !isNaN(maxLoan[0].loanIdNum)) nextId = maxLoan[0].loanIdNum + 1;
  const loanId = "L" + padId(nextId);

  // Create loan
  const loan = {
    loanId,
    applicationId,
    borrowersId: borrower.borrowersId,
    profilePic: application.profilePic || "",
    paidAmount: 0,
    balance: application.appTotalPayable,
    status: "Active",
    dateDisbursed: application.dateDisbursed || new Date(),
    createdAt: new Date(),
  };

  await repo.insertLoan(loan);

  // Generate collection schedule
  const collections = [];
  let runningBalance = application.appTotalPayable;
  const disbursedDate = new Date(application.dateDisbursed || new Date());
  const termsInMonths = application.appLoanTerms;
  const monthlyDue = application.appMonthlyDue;

  for (let i = 0; i < termsInMonths; i++) {
    const dueDate = new Date(disbursedDate);
    dueDate.setMonth(dueDate.getMonth() + i + 1);

    runningBalance -= monthlyDue;
    const periodBalance = monthlyDue; // No payment made yet

    collections.push({
      referenceNumber: `${loanId}-C${i + 1}`,
      loanId,
      borrowersId: borrower.borrowersId,
      name: borrower.name,
      collectionNumber: i + 1,
      dueDate,
      periodAmount: monthlyDue,
      paidAmount: 0,
      periodBalance,
      loanBalance: runningBalance > 0 ? runningBalance : 0,
      status: "Unpaid",
      collector: borrower.assignedCollector || "",
      note: "",
      createdAt: new Date(),
    });
  }

  await repo.insertCollections(collections);

  return loan;
};

module.exports = { createLoan };