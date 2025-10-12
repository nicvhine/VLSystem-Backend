const express = require('express');
const router = express.Router();

const { padId } = require("../../utils/generator");

module.exports = (db) => {
  
    // POST /generate-loan/:applicationId
    router.post('/generate-loan/:applicationId', async (req, res) => {
      const { applicationId } = req.params;
    
      try {
        const application = await db.collection("loan_applications").findOne({ applicationId });
    
        if (!application) {
          return res.status(404).json({ error: "Application not found" });
        }
    
        if (application.status !== "Active") {
          return res.status(400).json({ error: "Loan can only be generated for applications with status 'Active'" });
        }
    
        const existingLoan = await db.collection("loans").findOne({ applicationId });
        if (existingLoan) {
          return res.status(400).json({ error: "Loan already exists for this application" });
        }
    
        if (!application.borrowersId) {
          return res.status(400).json({ error: "BorrowersId missing. Borrower account must be created first." });
        }
    
        const borrower = await db.collection("borrowers_account").findOne({ borrowersId: application.borrowersId });
        if (!borrower) {
          return res.status(404).json({ error: "Borrower not found for the given borrowersId." });
        }
    
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
    
        const paidAmount = 0;
    
        const loan = {
          loanId,
          applicationId,
          borrowersId: borrower.borrowersId,
          profilePic: application.profilePic || "",
          paidAmount,
          balance: application.appTotalPayable,
          status: "Active",
          dateDisbursed: application.dateDisbursed || new Date(),
          createdAt: new Date(),
        };
    
        // Insert loan
        await db.collection("loans").insertOne(loan);
    
        const collections = [];
        let runningBalance = application.appTotalPayable;
        const disbursedDate = new Date(application.dateDisbursed || new Date());

        const termsInMonths = application.appLoanTerms; 
        const monthlyDue = application.appMonthlyDue; 

    
        for (let i = 0; i < termsInMonths; i++) {
          const dueDate = new Date(disbursedDate);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
    
          if (dueDate.getDate() !== disbursedDate.getDate()) {
            dueDate.setDate(0);
          }
    
          const periodBalance = monthlyDue;
          runningBalance -= monthlyDue;
    
          collections.push({
            referenceNumber: `${loanId}-C${i + 1}`,
            loanId,
            borrowersId: borrower.borrowersId,
            name: borrower.name,
            collectionNumber: i + 1,
            dueDate,
            periodAmount: monthlyDue, 
            paidAmount: 0,
            periodBalance,
            loanBalance: runningBalance > 0 ? runningBalance : 0,
            status: 'Unpaid',
            collector: borrower.assignedCollector || "",
            note: '',
            createdAt: new Date()
          });
        }
    
        await db.collection("collections").insertMany(collections);
    
        res.status(201).json({ message: "Loan and collections created successfully", loan });
    
      } catch (error) {
        console.error("Error generating loan:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

return router;
}