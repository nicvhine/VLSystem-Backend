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
  
      // Step 2: Ensure status is Active
      if (application.status !== "Active") {
        return res.status(400).json({ error: "Loan can only be generated for applications with status 'Active'" });
      }
  
      // Step 3: Check if the loan already exists
      const existingLoan = await db.collection("loans").findOne({ applicationId });
      if (existingLoan) {
        return res.status(400).json({ error: "Loan already exists for this application" });
      }
  
      // Step 4: Ensure borrower exists
      if (!application.borrowersId) {
        return res.status(400).json({ error: "BorrowersId missing. Borrower account must be created first." });
      }
  
      const borrower = await db.collection("borrowers_account").findOne({ borrowersId: application.borrowersId });
      if (!borrower) {
        return res.status(404).json({ error: "Borrower not found for the given borrowersId." });
      }
  
      // Step 5: Generate unique loanId
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
      const principal = Number(application.appLoanAmount);
      const interestRate = Number(application.appInterest);
  
      const interestAmount = principal * (interestRate / 100);
      const totalInterest = interestAmount * termsInMonths;
  
      const totalPayable = principal + totalInterest;
      const monthlyDue = totalPayable / termsInMonths;
      const balance = totalPayable;
      const paidAmount = 0;
      const releasedAmount = principal;
  
      const loan = {
        loanId,
        applicationId,
        name: borrower.name,
        dateOfBirth: application.appDob,
        maritalStatus: application.appMarital,
        noOfChildren: application.appChildren,
        borrowersId: borrower.borrowersId,
        address: application.appAddress,
        mobileNumber: application.appContact,
        email: application.appEmail,
        incomeSource: application.sourceOfIncome,
        monthlyIncome: application.appMonthlyIncome,
        occupation: application.appOccupation,
        employmentStatus: application.appEmploymentStatus,
        companyName: application.appCompanyName,
        borrowerUsername: borrower.username,
        principal,
        releasedAmount,
        interestRate,
        interestAmount,   
        totalInterest,    
        termsInMonths,
        profilePic: application.profilePic,
        loanType: application.loanType,
        totalPayable,
        monthlyDue,
        paidAmount,
        balance,
        status: "Active",
        dateReleased: new Date(),
        dateDisbursed: application.dateDisbursed,
      };
  
      // Step 7: Insert loan
      await db.collection("loans").insertOne(loan);
  
      // Step 8: Generate collection schedule
      const collections = [];
      const disbursedDate = new Date(application.dateDisbursed);
  
      for (let i = 0; i < termsInMonths; i++) {
        const dueDate = new Date(disbursedDate);
        dueDate.setMonth(dueDate.getMonth() + i + 1);
  
        // Adjust for end-of-month cases
        if (dueDate.getDate() !== disbursedDate.getDate()) {
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
          totalPaidAmount: paidAmount,
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




router.get("/loan-stats", async (req, res) => {
  try {
    const result = await db.collection("loans").aggregate([
      {
        $group: {
          _id: null,
          totalPrincipal: { $sum: "$principal" },
          totalInterest: { $sum: "$totalInterest"}
        }
      }
    ]).toArray();

    res.json({
    totalPrincipal: result[0]?.totalPrincipal || 0,
    totalInterest: result[0]?.totalInterest || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch loan stats" });
  }
});

router.get("/loan-type-stats", async (req, res) => {
  try {
    const collection = db.collection("loans");

    const types = await collection.aggregate([
      {
        $group: {
          _id: "$loanType",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          loanType: "$_id",
          count: 1
        }
      }
    ]).toArray();

    res.status(200).json(types);
  } catch (error) {
    console.error("Error fetching loan type stats:", error);
    res.status(500).json({ error: "Failed to fetch loan type statistics" });
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