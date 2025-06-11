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
        loanType: "Regular Loan Without Collateral",
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


  router.post("/with", async (req, res) => {
    try {
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest,
        // Collateral specific fields
        collateralType, collateralValue, collateralDescription, ownershipStatus
      } = req.body;

      // Validate required fields
      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || !appLoanTerms) {
        return res.status(400).json({ error: "All required fields must be provided." });
      }

      // Validate collateral fields
      if (!collateralType || !collateralValue || !collateralDescription || !ownershipStatus) {
        return res.status(400).json({ error: "All collateral fields are required for collateral loan applications." });
      }

      // Validate income source specific fields
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

      // Generate unique application ID
      const applicationIdSeq = await getNextSequence(db, "applicationId");
      const applicationId = `APP${applicationIdSeq.toString().padStart(5, "0")}`;

      // Base application object with collateral
      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest,
        hasCollateral: true,
        // Collateral information
        collateralType, collateralValue, collateralDescription, ownershipStatus,
        status: "Pending",
        loanType: "Regular Loan With Collateral",
        dateApplied: new Date()
      };

      // Add income source specific fields
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
      res.status(201).json({ 
        message: "Loan application (with collateral) submitted successfully", 
        application: newApplication 
      });
    } catch (error) {
      console.error("Error in /loan-applications/with:", error);
      res.status(500).json({ error: "Failed to submit loan application." });
    }
  });

  router.post("/open-term", async (req, res) => {
    try {
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest,
        // Open term specific fields
        repaymentSchedule, specialConditions, isCustomTerms
      } = req.body;

      // Validate required fields
      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || !appLoanTerms) {
        return res.status(400).json({ error: "All required fields must be provided." });
      }

      // Validate income source specific fields
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

      // Generate unique application ID
      const applicationIdSeq = await getNextSequence(db, "applicationId");
      const applicationId = `APP${applicationIdSeq.toString().padStart(5, "0")}`;

      // Base application object for open term
      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest,
        hasCollateral: false,
        loanType: "Open-Term Loan",
        // Open term specific fields
        repaymentSchedule,
        specialConditions,
        isCustomTerms: isCustomTerms || false,
        status: "Pending", // Different status for open term
        dateApplied: new Date()
      };

      // Add income source specific fields
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
      res.status(201).json({ 
        message: "Open-term loan application submitted successfully", 
        application: newApplication 
      });
    } catch (error) {
      console.error("Error in /loan-applications/open-term:", error);
      res.status(500).json({ error: "Failed to submit open-term loan application." });
    }
  });

 router.get("/", async (req, res) => {
  try {
    const applications = await loanApplications.find().toArray();
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error in GET /loan-applications:", error);
    res.status(500).json({ error: "Failed to fetch loan applications." });
  }
});


  return router;
};
