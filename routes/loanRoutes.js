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
        return res.status(400).json({ error: "Loan can only be generated for disbursed applications" });
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
              $convert: {
                input: { $substrBytes: ["$loanId", 1, { $subtract: [{ $strLenBytes: "$loanId" }, 1] }] },
                to: "int",
                onError: 0,
                onNull: 0
              }              
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
      const loanId = 'L' + padId(nextId);


      // Step 6: Compute totals
      const termsInMonths = application.appLoanTerms;
      const principal = application.appLoanAmount;
      const interestRate = application.appInterest; 
      const totalInterest = principal * (interestRate / 100) * termsInMonths;
      const totalPayable = principal + totalInterest;
      const monthlyDue = totalPayable / termsInMonths;
      const balance = totalPayable;
      const paidAmount = 0;

      const loan = {
        loanId,
        applicationId,
        name: borrower.name,
        dateOfBirth: application.appDob,
        maritalStatus: application.appMarital,
        noOfChildren: application.appChildren,
        borrowersId: borrower.borrowersId,  
        address: application.appAdress,
        mobileNumber: application.appContact,
        email: application.appEmail,
        incomeSource: application.sourceOfIncome,
        monthlyIncome: application.appMonthlyIncome,
        occupation: application.appOccupation,
        borrowerUsername: borrower.username,
        principal: application.appLoanAmount,
        interestRate: application.appInterest,
        termsInMonths: application.appLoanTerms,
        loanType: application.loanType,
        totalPayable,
        monthlyDue,
        paidAmount,
        balance,
        status: "Active",
        dateReleased: new Date(),
        dateDisbursed: application.dateDisbursed,
      };

      // Step 7: Insert into 'loans' collection
      await db.collection("loans").insertOne(loan);

          // Generate collections
      const collections = [];
      const disbursedDate = new Date(application.dateDisbursed);

        for (let i = 0; i < application.appLoanTerms; i++) {
        const dueDate = new Date(disbursedDate);
        dueDate.setMonth(dueDate.getMonth() + i + 1);

        // Adjust for edge case when month rolls over
        if (dueDate.getDate() !== disbursedDate.getDate()) {
          dueDate.setDate(0); 
          dueDate.setDate(0);
        }

      collections.push({
        referenceNumber: `${loanId}-C${i + 1}`, 
        loanId,
        borrowersId: borrower.borrowersId,
        name: borrower.name,
        collectionNumber: i + 1,
        dueDate,
        periodAmount: monthlyDue,
        totalPaidAmount: loan.paidAmount,
        paidAmount,
        balance,
        status: 'Unpaid',
        collector: borrower.assignedCollector,
        note: '',
        createdAt: new Date(),
      });

      }

      await db.collection("collections").insertMany(collections);
      res.status(201).json({ message: "Loan created successfully", loan });

    } catch (error) {
      console.error("Error generating loan:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });




  router.get('/active-loan/:borrowersId', async (req, res) => {
    const { borrowersId } = req.params;
  
    try {
      const loan = await db.collection('loans').findOne({
        borrowersId,
        status: 'Active'
      });
  
      if (!loan) {
        return res.status(404).json({ error: 'No active loan found for this borrower.' });
      }
  
      res.json(loan);
    } catch (err) {
      console.error('Error fetching loan by borrower ID:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  router.get("/", async (req, res) => {
  try {
    const allLoans = await db.collection("loans").find().toArray();
    res.status(200).json(allLoans);
  } catch (error) {
    console.error("Error in GET /loans:", error);
    res.status(500).json({ error: "Failed to fetch loans." });
  }
});

router.get('/:loanId', async (req, res) => {
  const { loanId } = req.params;

  try {
    const loan = await db.collection('loans').findOne({ loanId });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    const borrower = await db.collection('borrowers_account').findOne({ borrowersId: loan.borrowersId });

    res.json({
  ...loan,
  ...borrower && {
    contactNumber: borrower.contactNumber,
    emailAddress: borrower.emailAddress,
    address: borrower.address,
    barangay: borrower.barangay,
    municipality: borrower.municipality,
    province: borrower.province,
    houseStatus: borrower.houseStatus,
    sourceOfIncome: borrower.sourceOfIncome,
    occupation: borrower.occupation,
    monthlyIncome: borrower.monthlyIncome,
    dateOfBirth: borrower.dateOfBirth,
    maritalStatus: borrower.maritalStatus,
    numberOfChildren: borrower.numberOfChildren,
    characterReferences: borrower.characterReferences || [],
    score: borrower.score || 0,
    imageUrl: borrower.imageUrl || null,
    activeLoan: 'Yes',
    numberOfLoans: borrower.numberOfLoans || 1,
    currentLoan: {
      totalPayable: loan.totalPayable,
      type: loan.loanType ,
      amount: loan.principal,
      terms: loan.termsInMonths,
      interestRate: loan.interestRate,
      paymentSchedule: loan.paymentSchedule,
      startDate: loan.dateReleased?.toISOString().split('T')[0],
      maturityDate: loan.maturityDate || 'Auto-calculate this',
      remainingBalance: loan.balance,
      dateDisbursed: loan.dateDisbursed,
    }
  }
});

  } catch (error) {
    console.error('Error fetching loan by loanId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




  return router;
};

