const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/auth');

const { decrypt } = require('../../utils/crypt'); 

module.exports = (db) => {

  router.get("/", authenticateToken, async (req, res) => {
    try {
      const loans = await db.collection("loans").find().toArray();

      const loansWithNames = await Promise.all(
        loans.map(async (loan) => {
          const borrower = await db.collection("borrowers_account").findOne({ borrowersId: loan.borrowersId });
          return { ...loan, name: decrypt(borrower?.name) || "" };
        })
      );

      res.status(200).json(loansWithNames);
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
  

  return router;
}
