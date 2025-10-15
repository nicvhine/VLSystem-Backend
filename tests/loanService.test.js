const { connect, clear, close, getDb } = require('./testDB');
const loanService = require('../Services/loanService');
const { mockApplication, mockBorrower} = require('./mocks');

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
    const application = await mockApplication(db, applicationId, null);

    const borrowersId = 'BRW001'
    const borrowerData = {
      name: application.appName,
      dob: application.appDob,
      contact: application.appContact,
      email: application.appEmail,
      address: application.appAddress,
      monthlyIncome: application.appMonthlyIncome,
      applicationId: application.applicationId,
    };

    const borrower = await mockBorrower(db, borrowersId, borrowerData);

    const loan = await loanService.createLoan(applicationId, db);


    expect(application).toBeDefined();
    expect(application.applicationId).toBe(applicationId);

    expect(borrower).toBeDefined();
    expect(borrower.borrowersId).toBe(borrowersId);

    expect(loan).toBeDefined();

  });
});
