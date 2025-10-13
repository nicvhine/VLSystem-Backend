module.exports = (db) => {
    const borrowers = db.collection("borrowers_account");
    const applications = db.collection("loan_applications");
  
    return {
      findByUsername: (username) => borrowers.findOne({ username }),
      findByEmail: (email) => borrowers.findOne({ email }),
      findByUsernameAndEmail: (username, email) => borrowers.findOne({ username, email }),
      findByBorrowersId: (borrowersId) => borrowers.findOne({ borrowersId }),
      findApplicationById: (applicationId) => applications.findOne({ applicationId }),
      insertBorrower: (borrower) => borrowers.insertOne(borrower),
      updateApplicationWithBorrower: (applicationId, borrowersId, username) =>
        applications.updateOne(
          { applicationId },
          { $set: { borrowersId, username } }
        ),
    };
  };
  