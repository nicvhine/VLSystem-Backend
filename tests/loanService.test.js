const { connect, clear, close, getDb } = require('./testDB');
const loanService = require('../Services/loanService');
const { mockApplication } = require('./mocks');
const { createBorrower } = require('../Services/borrowerService');

let db;

beforeAll(async () => {
  await connect();
  db = getDb();
});

afterEach(async () => await clear());
afterAll(async () => await close());

describe('Loan Service', () => {
  test('should generate loan', async () => {
    const applicationId = 'test-app-001';
    const applicationData = await mockApplication(db, applicationId, {});

    const borrowerData = {
      borrowersId: 'BRW001',
      name: applicationData.appName,
      dob: applicationData.appDob,
      contact: applicationData.appContact,
      email: applicationData.appEmail,
      address: applicationData.appAddress,
      monthlyIncome: applicationData.appMonthlyIncome,
      role: 'borrower',
      applicationId: applicationData.applicationId,
      assignedCollector: 'Ross Geller',
    };

    const borrower = await createBorrower(borrowerData, db);

    const loanData = {
      applicationId: applicationId,
      borrowerId: borrower.borrowerId,
      assignedCollector: 'COL001',
      loanAmount: applicationData.appLoanAmount,
      loanTerms: applicationData.appLoanTerms,
      interestRate: applicationData.appInterestRate
    };

    const loan = await loanService.createLoan(loanData, db);

    expect(loan).toBeDefined();
    expect(loan.applicationId).toBe(applicationId);
    expect(loan.assignedCollector).toBe('COL001');
  });
});
