const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const logAction = require('../utils/log');
const { ObjectId } = require("mongodb");
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
        releasedAmount,
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

 router.post('/generate-reloan/:borrowersId', async (req, res) => {
  const { borrowersId} = req.params;

    console.log(`Generating reloan for borrower ${borrowersId}`);


  try {
    const dbLoans = db.collection("loans");
    const dbApplications = db.collection("loan_applications");
    const dbBorrowers = db.collection("borrowers_account");

    const application = await dbApplications.findOne(
      { borrowersId, status: "Accepted" },
      { sort: { dateCreated: -1 } }
    );

    if (!application) {
      return res.status(404).json({ error: 'No accepted application found.' });
    }

    const borrower = await dbBorrowers.findOne({ borrowersId });
    if (!borrower) {
      return res.status(404).json({ error: 'Borrower not found.' });
    }

   const previousLoan = await db.collection("loans")
  .find({ borrowersId, status: { $in: ["Active", "Closed"] } })
  .sort({ dateDisbursed: -1 })
  .limit(1)
  .toArray();

let unpaidBalance = 0;
let previousLoanId = null;

if (previousLoan.length > 0) {
  unpaidBalance = Number(previousLoan[0].balance) || 0;
  previousLoanId = previousLoan[0].loanId;

  // Mark previous loan as closed if it's still active
  if (previousLoan[0].status === "Active") {
    await db.collection("loans").updateOne(
      { loanId: previousLoanId },
      { $set: { status: "Closed", closedAt: new Date() } }
    );
  }
}


    // Generate new loanId
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


    const appLoanAmount = application.appLoanAmount;
    const appInterest = application.appInterest;
    const appLoanTerms = application.appLoanTerms;
    const appReloanType = application.appReloanType || 'Add-To-Principal'; 

    let principal, releasedAmount;

    if (appReloanType === 'Net-Proceeds') {
      principal = appLoanAmount;
      releasedAmount = appLoanAmount - unpaidBalance;
    } else {
      principal = appLoanAmount + unpaidBalance;
      releasedAmount = principal;
    }

    const totalInterest = principal * (appInterest / 100) * appLoanTerms;
    const totalPayable = principal + totalInterest;
    const monthlyDue = totalPayable / appLoanTerms;


    const newLoan = {
      loanId,
      applicationId: application.applicationId,
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
      principal,
      releasedAmount,
      originalPrincipal: appLoanAmount,
      carriedOverBalance: unpaidBalance,
      previousLoanId,
      interestRate: appInterest,
      termsInMonths: appLoanTerms,
      loanType: application.loanType || "Reloan",
      appReloanType,
      totalPayable,
      monthlyDue,
      paidAmount: 0,
      balance: totalPayable,
      status: "Active",
      dateReleased: new Date(),
      dateDisbursed: new Date(),
      previousLoanId,
      type: "reloan",
    };

    await dbLoans.insertOne(newLoan);

    // Generate collections
    const collections = [];
    const disbursedDate = new Date();

    for (let i = 0; i < appLoanTerms; i++) {
      const dueDate = new Date(disbursedDate);
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      if (dueDate.getDate() !== disbursedDate.getDate()) {
        dueDate.setDate(0);
      }

      collections.push({
        referenceNumber: `${loanId}-C${i + 1}`,
        loanId,
        borrowersId,
        name: borrower.name,
        collectionNumber: i + 1,
        dueDate,
        periodAmount: monthlyDue,
        totalPaidAmount: 0,
        paidAmount: 0,
        balance: monthlyDue,
        status: 'Unpaid',
        collector: borrower.assignedCollector,
        note: '',
        createdAt: new Date(),
      });
    }

    await db.collection("collections").insertMany(collections);

    res.status(201).json({
      message: "Reloan successfully generated",
      loan: newLoan,
      previousLoanClosed: previousLoanId || null,

      unpaidBalanceTransferred: unpaidBalance
    });

    await logAction(db, req.user.username, 'CREATE_RELOAN', `Reloan ${loanId} created for ${borrower.name}`);

  } catch (error) {
    console.error("Error generating reloan:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


   // Close loan by updating its status
  router.put('/close/:loanId', async (req, res) => {
  const { loanId } = req.params;
  const dbLoans = db.collection("loans"); // FIXED

  try {
    const result = await dbLoans.updateOne(
      { loanId },
      {
        $set: {
          status: "Closed",
          closedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Loan not found" });
    }

    res.json({ message: "Loan successfully closed" });
  } catch (err) {
    console.error("Error closing loan:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});




  router.get('/loan-stats', authenticateToken, async (req, res) => {
  try {
    const dbLoans = db.collection('loans');
    const dbApplications = db.collection('loan_applications');

    const loans = await dbLoans.find().toArray();
    const applications = await dbApplications.find().toArray();

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalCollectables = 0;
    let totalCollected = 0;
    let totalUnpaid = 0;

    const loanTypeCount = {};

    for (const loan of loans) {
      const principal = loan.principal || 0;
      const interestRate = loan.interestRate || 0;
      const terms = loan.termsInMonths || 0;

      const interest = principal * (interestRate / 100) * terms;
      const totalPayable = principal + interest;
      const paid = loan.paidAmount || 0;
      const balance = loan.balance || (totalPayable - paid);

      totalPrincipal += principal;
      totalInterest += interest;
      totalCollectables += totalPayable;
      totalCollected += paid;
      totalUnpaid += balance;

      const type = loan.loanType || 'Unknown';
      loanTypeCount[type] = (loanTypeCount[type] || 0) + 1;
    }

    const typeStats = Object.entries(loanTypeCount)
    .map(([loanType, count]) => ({ loanType, count }))
    .sort((a, b) => b.count - a.count);

    const statusCounts = {
      approved: 0,
      denied: 0,
      pending: 0,
      onHold: 0,
    };

    for (const app of applications) {
      const status = (app.status || '').toLowerCase();

      if (status === 'accepted' || status === 'approved') {
        statusCounts.approved++;
      } else if (status === 'denied' || status === 'rejected') {
        statusCounts.denied++;
      } else if (status === 'pending') {
        statusCounts.pending++;
      } else if (status === 'on hold' || status === 'onhold') {
        statusCounts.onHold++;
      }
    }

    res.json({
      totalLoans: loans.length,
      totalPrincipal,
      totalInterest,
      totalCollectables,
      totalCollected,
      totalUnpaid,
      typeStats,
      applicationStatuses: statusCounts,
    });
  } catch (err) {
    console.error('Error getting loan stats:', err);
    res.status(500).json({ error: 'Failed to fetch loan statistics' });
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
  
       const paymentProgress = loan.totalPayable > 0
      ? Math.round((loan.paidAmount / loan.totalPayable) * 100)
      : 0;

      res.json({ ...loan, paymentProgress });
    } catch (err) {
      console.error('Error fetching loan by borrower ID:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all loans for a borrower (for navigation)
  router.get('/borrower-loans/:borrowersId', async (req, res) => {
    const { borrowersId } = req.params;
  
    try {
      const loans = await db.collection('loans').find({
        $or: [
          { borrowersId },
          { borrowerId: borrowersId }
        ]
      }).sort({ dateDisbursed: -1 }).toArray(); // Sort by latest first
  
      if (!loans || loans.length === 0) {
        return res.status(404).json({ error: 'No loans found for this borrower.' });
      }
  
      // Add payment progress to each loan
      const loansWithProgress = loans.map(loan => {
        const paymentProgress = loan.totalPayable > 0
          ? Math.round((loan.paidAmount / loan.totalPayable) * 100)
          : 0;
        return { ...loan, paymentProgress };
      });
  
      res.json(loansWithProgress);
    } catch (err) {
      console.error('Error fetching loans for borrower:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  router.get("/", authenticateToken, async (req, res) => {
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