const express = require('express');
const router = express.Router();

function padId(num) {
  return num.toString().padStart(5, '0');
}

module.exports = (db) => {
  router.post('/generate-loan/:applicationId', async (req, res) => {
    const { applicationId } = req.params;

    try {
      // Step 1: Fetch the loan application
      const application = await db.collection("loan_applications").findOne({ applicationId });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status !== "Accepted") {
        return res.status(400).json({ error: "Loan can only be generated for accepted applications" });
      }

      // Step 2: Check if the loan already exists
      const existingLoan = await db.collection("loans").findOne({ applicationId });
      if (existingLoan) {
        return res.status(400).json({ error: "Loan already exists for this application" });
      }

      // Step 3: Make sure the application has a borrowersId (added when borrower was created)
      if (!application.borrowersId) {
        return res.status(400).json({ error: "BorrowersId missing in loan application. Borrower account must be created after acceptance." });
      }

      // Step 4: Find borrower using borrowersId
      const borrower = await db.collection("borrowers_account").findOne({ borrowersId: application.borrowersId });
      if (!borrower) {
        return res.status(404).json({ error: "Borrower not found for the given borrowersId." });
      }

      // Step 5: Generate a unique loanId
      
      const maxLoan = await db.collection("loans").aggregate([
        {
          $addFields: {
            loanIdNum: {
              $toInt: { $substr: ["$loanId", 1, -1] }
            }
          }
        },
        { $sort: { loanIdNum: -1 } },
        { $limit: 1 }
      ]).toArray();

      let nextId = 1;
      if (maxLoan.length > 0 && !isNaN(maxLoan[0].loanIdNum)) {
        nextId = maxLoan[0].loanIdNum + 1;
      }
      const loanId = 'L ' + padId(nextId);


      // Step 6: Compute totals
      const termYears = application.appLoanTerms / 12;
      const totalPayable =
        application.appLoanAmount +
        (application.appLoanAmount * (application.appInterest / 100) * termYears);

      const loan = {
        loanId,
        applicationId,
        borrowersId: borrower.borrowersId,
        borrowerUsername: borrower.username,
        principal: application.appLoanAmount,
        interestRate: application.appInterest,
        termsInMonths: application.appLoanTerms,
        totalPayable,
        balance: totalPayable,
        status: "Active",
        dateReleased: new Date(),
      };

      // Step 7: Insert into 'loans' collection
      await db.collection("loans").insertOne(loan);

      res.status(201).json({ message: "Loan created successfully", loan });

    } catch (error) {
      console.error("Error generating loan:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
