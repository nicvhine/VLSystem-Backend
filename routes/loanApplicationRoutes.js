const express = require('express');
const router = express.Router();

module.exports = (db, getNextSequence) => {
  const loanApplications = db.collection("loan_applications");

  router.post("/without", async (req, res) => {
    try {
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest
      } = req.body;

      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || !appLoanTerms) {
        return res.status(400).json({ error: "All required fields must be provided." });
      }

      if (sourceOfIncome === "business") {
        if (!appTypeBusiness || !appDateStarted || !appBusinessLoc || appMonthlyIncome == null) {
          return res.status(400).json({ error: "Business fields are required for business income source." });
        }
      } else if (sourceOfIncome === "employed") {
        if (!appOccupation || !appEmploymentStatus || !appCompanyName || appMonthlyIncome == null) {
          return res.status(400).json({ error: "Employment fields are required for employed income source." });
        }
      } else {
        return res.status(400).json({ error: "Invalid source of income." });
      }

      const applicationIdSeq = await getNextSequence(db, "applicationId");
      const applicationId = `APP${applicationIdSeq.toString().padStart(5, "0")}`;

      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest,
        hasCollateral: false,
        status: "Pending",
        dateApplied: new Date()
      };

      if (sourceOfIncome === "business") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appTypeBusiness, appDateStarted, appBusinessLoc
        };
      } else if (sourceOfIncome === "employed") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appOccupation, appEmploymentStatus, appCompanyName
        };
      }

      await loanApplications.insertOne(newApplication);
      res.status(201).json({ message: "Loan application (no collateral) submitted successfully", application: newApplication });
    } catch (error) {
      console.error("Error in /loan-applications/without:", error);
      res.status(500).json({ error: "Failed to submit loan application." });
    }
  });

  return router;
};
