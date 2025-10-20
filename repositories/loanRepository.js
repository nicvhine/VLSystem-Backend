module.exports = (db) => {
    const loanApplications = db.collection("loan_applications");
    const loans = db.collection("loans");
    const borrowers = db.collection("borrowers_account");
    const collections = db.collection("collections");
  
    return {
      // Find application by id
      findApplicationById: async (applicationId) => await loanApplications.findOne({ applicationId }),
  
      // Check if a loan already exists for application
      findExistingLoan: async (applicationId) => await loans.findOne({ applicationId }),
  
      // Find borrower by borrowersId
      findBorrowerById: async (borrowersId) => await borrowers.findOne({ borrowersId }),
  
      // Get highest numeric loan id
      getMaxLoan: async () => {
        return await loans.aggregate([
          {
            $addFields: {
              loanIdNum: {
                $convert: {
                  input: { $substrBytes: ["$loanId", 1, { $subtract: [{ $strLenBytes: "$loanId" }, 1] }] },
                  to: "int",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
          { $sort: { loanIdNum: -1 } },
          { $limit: 1 },
        ]).toArray();
      },
  
      // Insert a new loan document
      insertLoan: async (loan) => await loans.insertOne(loan),
  
      // Bulk insert collection schedule
      insertCollections: async (collectionsData) => await collections.insertMany(collectionsData),
    };
  };
  