async function mockApplication(db, applicationId, overrides = {}) {
    const defaultData = {
        applicationId,
        appDob: '1990-05-15',
        appEmail: 'brad@pitt.com',
        profilePic: { filePath: 'uploads/brapitt.jpg' }
    };

    const applicationData = { ...defaultData, ...overrides };
    const result = await db.collection('loan_applications').insertOne(applicationData);
    return { ...applicationData, _id: result.insertedId };
}

module.exports = { insertMockApplication: mockApplication };
