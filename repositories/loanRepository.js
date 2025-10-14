module.exports = (db) => {
    const loanApplications = db.collection("loan_applications");
    const loans = db.collection("loans");
    const borrowers = db.collection("borrowers_account");
    const collections = db.collection("collections");
  
    return {
      findApplicationById: async (applicationId) => await loanApplications.findOne({ applicationId }),
  
      findExistingLoan: async (applicationId) => await loans.findOne({ applicationId }),
  
      findBorrowerById: async (borrowersId) => await borrowers.findOne({ borrowersId }),
  
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
  
      insertLoan: async (loan) => await loans.insertOne(loan),
  
      insertCollections: async (collectionsData) => await collections.insertMany(collectionsData),
    };
  };
  