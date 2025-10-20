const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');
const { decrypt } = require('../../Utils/crypt'); 

module.exports = (db) => {

  router.get("/", authenticateToken, async (req, res) => {
    try {
      const loans = await db.collection("loans").find().toArray();
  
      const loansWithDetails = await Promise.all(
        loans.map(async (loan) => {
          const borrower = await db.collection("borrowers_account").findOne({ borrowersId: loan.borrowersId });
  
          // Fetch related application info
          const application = await db.collection("loan_applications").findOne({ applicationId: loan.applicationId });
  
          return {
            ...loan,
            ...application, 
            name: borrower ? decrypt(borrower.name) : "",
          };
        })
      );
  
      res.status(200).json(loansWithDetails);
    } catch (error) {
      console.error("Error in GET /loans:", error);
      res.status(500).json({ error: "Failed to fetch loans." });
    }
  });

  router.get('/:loanId', async (req, res) => {
    const { loanId } = req.params;
  
    try {
      const loan = await db.collection('loans').findOne({ loanId });
      if (!loan) return res.status(404).json({ error: 'Loan not found.' });
  
      const application = await db.collection('loan_applications').findOne({ applicationId: loan.applicationId });
      if (!application) return res.status(404).json({ error: 'Loan application not found.' });
  
      const isActive = loan.status === 'Active';
      const pastLoans = await db.collection('loans')
        .find({ borrowersId: loan.borrowersId, status: { $ne: 'Active' } })
        .sort({ dateDisbursed: -1 })
        .toArray();
  
      const totalLoansCount = await db.collection('loans').countDocuments({ borrowersId: loan.borrowersId });
  
      const d = (val) => val ? decrypt(val) : "";
  
      const parsedReferences = Array.isArray(application.appReferences) ? application.appReferences : [];
  
      const currentLoan = isActive ? {
        principal: application.appLoanAmount,
        totalPayable: application.appTotalPayable,
        type: application.loanType,
        termsInMonths: application.appLoanTerms,
        interestRate: application.appInterestRate,
        paymentSchedule: loan.paymentSchedule,
        startDate: loan.dateReleased?.toISOString().split('T')[0],
        paidAmount: loan.paidAmount || 0,
        remainingBalance: loan.balance || application.appTotalPayable,
        dateDisbursed: loan.dateDisbursed,
        status: loan.status,
      } : undefined;
  
      const response = {
        ...loan,
        ...application,
        name: d(application.appName),
        spouseName: d(application.appSpouseName),
        contactNumber: d(application.appContact),
        emailAddress: d(application.appEmail),
        address: d(application.appAddress),
        references: parsedReferences.map(r => ({
          name: d(r.name),
          contact: d(r.contact),
          relation: r.relation
        })),
        totalLoans: totalLoansCount, 
        currentLoan,
        previousLoans: pastLoans.map(l => ({
          type: l.loanType,
          principal: l.principal,
          amount: l.principal,
          dateDisbursed: l.dateDisbursed,
          status: l.status,
          interestRate: l.interestRate,
          terms: l.termsInMonths,
        })),
      };
  
      res.json(response);
  
    } catch (error) {
      console.error('Error fetching loan by loanId:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

// Fetch active loan for a borrower
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

    const paymentProgress = loan.totalPayable > 0
      ? Math.round((loan.paidAmount / loan.totalPayable) * 100)
      : 0;

    res.json({ 
      loanId: loan.loanId,
      borrowersId: loan.borrowersId,
      paymentProgress
    });
  } catch (err) {
    console.error('Error fetching loan by borrower ID:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full loan details with related application and collections
router.get("/details/:loanId", async (req, res) => {
  const { loanId } = req.params;

  try {
    // Step 1: Fetch the loan document
    const loan = await db.collection("loans").findOne({ loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan not found." });
    }

    // Step 2: Fetch the related loan application
    const application = await db.collection("loan_applications").findOne({
      applicationId: loan.applicationId,
    });

    // Step 3: Fetch the collection schedule for this loan
    const collections = await db
      .collection("collections")
      .find({ loanId })
      .sort({ collectionNumber: 1 })
      .toArray();

    // Step 4: Compute payment progress
    const paymentProgress =
      loan.totalPayable > 0
        ? Math.round((loan.paidAmount / loan.totalPayable) * 100)
        : 0;

    const result = {
      loanId: loan.loanId,
      ...application,
      collections, 
      borrowerDetails: {
        address: application?.appAddress,
        contact: application?.appContact,
        occupation: application?.appOccupation,
        incomeSource: application?.sourceOfIncome,
        monthlyIncome: application?.appMonthlyIncome,
      },
    };

    res.json(result);
  } catch (error) {
    console.error("Error fetching loan details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


  return router;
}
