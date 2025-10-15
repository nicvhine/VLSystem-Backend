async function mockBorrower(db, borrowersId, overrides = {}) {

    let defaultData = {
        borrowersId: borrowersId,
        name: 'Brad Pitt',
        role: 'borrower',
        assignedCollector: 'COL001'
    };

    const borrowerData = { ...defaultData, ...overrides };
    const result = await db.collection('borrowers').insertOne(borrowerData);
    return { ...borrowerData, _id: result.insertedId };
}

async function mockApplication(db, applicationId, overrides = {}) {
    const defaultData = {
        applicationId: applicationId,
        appName: 'Nichole Alburo',
        appDob: '1990-05-15',
        appContact: '09153925728',
        appEmail: 'brad@pitt.com',
        appMarital: 'Single',
        appChildren: 0, 
        appAddress: 'Bogo City',
        appMonthlyIncome: 2000,
        appLoanPurpose: 'Allowance',
        appLoanAmount: 20000, 
        appLoanTerms: 8, 
        appInterestRate: 10,
        appAgent: {
            id: 'AGT00001',
            name: 'Lileth Dayuno'
        },
        loanType: 'Regular Loan Without Collateral',
        status: 'Active',
        documents: {
            fileName: 'heatmap (5).png',
            filePath: 'uploads/documents/heatmap (5).png', 
            mimeType: 'image/png' 
        },
        profilePic: { filePath: 'uploads/brapitt.jpg' }
    };

    const applicationData = { ...defaultData, ...overrides };
    const result = await db.collection('loan_applications').insertOne(applicationData);
    return { ...applicationData, _id: result.insertedId };
}

module.exports = { mockApplication, mockBorrower };
