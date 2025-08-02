const express = require('express');
const router = express.Router();

function padId(num) {
  return num.toString().padStart(5, '0');
}

module.exports = (db) => {
  const loanApplications = db.collection("loan_applications");

  async function generateApplicationId() {
    const maxApp = await loanApplications.aggregate([
      { $addFields: { applicationIdNum: { $toInt: "$applicationId" } } },
      { $sort: { applicationIdNum: -1 } },
      { $limit: 1 }
    ]).toArray();

    let nextAppId = 1;
    if (maxApp.length > 0 && !isNaN(maxApp[0].applicationIdNum)) {
      nextAppId = maxApp[0].applicationIdNum + 1;
    }
    return padId(nextAppId);
  }

  // LOAN WITHOUT COLLATERAL
  router.post("/without", async (req, res) => {
    try {
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, appReferences, 
      } = req.body;

      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || !appLoanTerms ) {
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

      if (!Array.isArray(appReferences) || appReferences.length !== 3) {
        return res.status(400).json({ error: "Three references must be provided." });
      }

      for (const ref of appReferences) {
        if (!ref.name || !ref.contact || !ref.relation) {
          return res.status(400).json({ error: "Each reference must include name, contact, and relation." });
        }
      }

      const applicationId = await generateApplicationId();

      const totalInterest = appLoanAmount * (appInterest / 100) * appLoanTerms;

      const totalPayable = appLoanAmount + totalInterest;
      
      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, totalPayable, appReferences,
        hasCollateral: false,
        loanType: "Regular Loan Without Collateral",
        status: "Pending",
        dateApplied: new Date(),
        isReloan: false
      };

      if (newApplication.status === "Disbursed") {
        newApplication.dateDisbursed = new Date();
      }

      if (sourceOfIncome === "business") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appTypeBusiness, appDateStarted, appBusinessLoc
        };
      } else {
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

// RELOAN WITHOUT COLLATERAL
router.post("/without/reloan/:borrowersId", async (req, res) => {
  const { borrowersId } = req.params; 
  const borrowers = db.collection("borrowers_account");
  const loans = db.collection("loans");

  try {
    const borrowersInfo = await borrowers.findOne({ borrowersId });

    if (!borrowersInfo) {
      return res.status(404).json({ error: "Borrower information not found." });
    }

    const {
      appReloanType,
      appLoanPurpose,
      appLoanAmount,
      appLoanTerms,
      appInterest,
    } = req.body;

    if (!appLoanPurpose || !appLoanAmount || !appLoanTerms || !appInterest) {
      return res.status(400).json({ error: "All reloan fields must be provided." });
    }

    const latestLoan = await loans.findOne(
      { borrowersId, status: "Active" },
      { sort: { dateDisbursed: -1 } }
    );

    if (!latestLoan) {
      return res.status(404).json({ error: "No active loan found for this borrower." });
    }

    const applicationId = await generateApplicationId();

    const totalInterest = appLoanAmount * (appInterest / 100) * appLoanTerms;
    const totalPayable = appLoanAmount + totalInterest;

    const reloanApplication = {
      applicationId,
      borrowersId,
      appName: latestLoan.appName,
      appDob: latestLoan.appDob,
      appContact: latestLoan.appContact,
      appEmail: latestLoan.appEmail,
      appMarital: latestLoan.appMarital,
      appChildren: latestLoan.appChildren,
      appSpouseName: latestLoan.appSpouseName,
      appSpouseOccupation: latestLoan.appSpouseOccupation,
      appAddress: latestLoan.appAddress,
      appMonthlyIncome: latestLoan.appMonthlyIncome,
      sourceOfIncome: latestLoan.sourceOfIncome,
      appLoanPurpose,
      appLoanAmount,
      appLoanTerms,
      appInterest,
      totalPayable,
      loanType: "Reloan Without Collateral",
      hasCollateral: false,
      isReloan: true,
      appReloanType,
      status: "Pending",
      dateApplied: new Date(),
    };

    if (latestLoan.sourceOfIncome === "business") {
      reloanApplication.appTypeBusiness = latestLoan.appTypeBusiness;
      reloanApplication.appDateStarted = latestLoan.appDateStarted;
      reloanApplication.appBusinessLoc = latestLoan.appBusinessLoc;
    } else if (latestLoan.sourceOfIncome === "employed") {
      reloanApplication.appOccupation = latestLoan.appOccupation;
      reloanApplication.appEmploymentStatus = latestLoan.appEmploymentStatus;
      reloanApplication.appCompanyName = latestLoan.appCompanyName;
    }

    await loanApplications.insertOne(reloanApplication);

    res.status(201).json({
      message: "Reloan application submitted successfully.",
      application: reloanApplication,
    });

  } catch (error) {
    console.error("Error in /loan-applications/without/reloan:", error);
    res.status(500).json({ error: "Failed to submit reloan application." });
  }
});




  //LOAN WITH COLLATERAL
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
        collateralType, collateralValue, collateralDescription, ownershipStatus
      } = req.body;

      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || !appLoanTerms) {
        return res.status(400).json({ error: "All required fields must be provided." });
      }

      if (!collateralType || !collateralValue || !collateralDescription || !ownershipStatus) {
        return res.status(400).json({ error: "All collateral fields are required for collateral loan applications." });
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

      const applicationId = await generateApplicationId();

      const totalInterest = appLoanAmount * (appInterest / 100) * appLoanTerms;

      const totalPayable = appLoanAmount + totalInterest;

      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, totalPayable,
        hasCollateral: true,
        collateralType, collateralValue, collateralDescription, ownershipStatus,
        loanType: "Regular Loan With Collateral",
        status: "Pending",
        dateApplied: new Date()
      };

      if (newApplication.status === "Disbursed") {
  newApplication.dateDisbursed = new Date();
}

      if (sourceOfIncome === "business") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appTypeBusiness, appDateStarted, appBusinessLoc
        };
      } else {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appOccupation, appEmploymentStatus, appCompanyName
        };
      }

      await loanApplications.insertOne(newApplication);
      res.status(201).json({ message: "Loan application (with collateral) submitted successfully", application: newApplication });
    } catch (error) {
      console.error("Error in /loan-applications/with:", error);
      res.status(500).json({ error: "Failed to submit loan application." });
    }
  });

//OPEN-TERM LOAN
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
        repaymentSchedule, specialConditions, isCustomTerms
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

      const applicationId = await generateApplicationId();

      const totalInterest = appLoanAmount * (appInterest / 100) * appLoanTerms;

      const totalPayable = appLoanAmount + totalInterest;

      let newApplication = {
        applicationId,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appMonthlyIncome,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, totalPayable,
        hasCollateral: false,
        loanType: "Open-Term Loan",
        repaymentSchedule,
        specialConditions,
        isCustomTerms: isCustomTerms || false,
        status: "Pending",
        dateApplied: new Date()
      };

      if (newApplication.status === "Disbursed") {
  newApplication.dateDisbursed = new Date();
}
      if (sourceOfIncome === "business") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appTypeBusiness, appDateStarted, appBusinessLoc
        };
      } else {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appOccupation, appEmploymentStatus, appCompanyName
        };
      }

      await loanApplications.insertOne(newApplication);
      res.status(201).json({ message: "Open-term loan application submitted successfully", application: newApplication });
    } catch (error) {
      console.error("Error in /loan-applications/open-term:", error);
      res.status(500).json({ error: "Failed to submit open-term loan application." });
    }
  });

  //  Get all loan applications 
  router.get("/", async (req, res) => {
    try {
      const applications = await loanApplications.find().toArray();
      res.status(200).json(applications);
    } catch (error) {
      console.error("Error in GET /loan-applications:", error);
      res.status(500).json({ error: "Failed to fetch loan applications." });
    }
  });



router.get("/loan-stats", async (req, res) => {
  try {
    const collection = db.collection("loan_applications");

    const [approved, denied, pending, onHold] = await Promise.all([
      collection.countDocuments({ status: "Accepted" }),
      collection.countDocuments({ status: "Denied by LO" }),
      collection.countDocuments({ status: "Pending" }),
      collection.countDocuments({ status: "On Hold" }),
    ]);

    res.json({
      approved,
      denied,
      pending,
      onHold,
    });
  } catch (error) {
    console.error("Error fetching loan stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});
  


router.get("/monthly-loan-stats", async (req, res) => {
  try {
    const pipeline = [
      {
        $addFields: {
          month: { $month: "$dateApplied" },
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.month",
          stats: {
            $push: {
              status: "$_id.status",
              count: "$count",
            },
          },
        },
      },
      {
        $addFields: {
          monthName: {
            $arrayElemAt: [
              [
                "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
              ],
              "$_id",
            ],
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          month: "$monthName",
          approved: {
            $let: {
              vars: {
                matched: {
                  $filter: {
                    input: "$stats",
                    as: "item",
                    cond: { $eq: ["$$item.status", "Accepted"] },
                  },
                },
              },
              in: { $ifNull: [{ $arrayElemAt: ["$$matched.count", 0] }, 0] },
            },
          },
          denied: {
            $let: {
              vars: {
                matched: {
                  $filter: {
                    input: "$stats",
                    as: "item",
                    cond: { $eq: ["$$item.status", "Denied by LO"] },
                  },
                },
              },
              in: { $ifNull: [{ $arrayElemAt: ["$$matched.count", 0] }, 0] },
            },
          },
          pending: {
            $let: {
              vars: {
                matched: {
                  $filter: {
                    input: "$stats",
                    as: "item",
                    cond: { $eq: ["$$item.status", "Pending"] },
                  },
                },
              },
              in: { $ifNull: [{ $arrayElemAt: ["$$matched.count", 0] }, 0] },
            },
          },
          onHold: {
            $let: {
              vars: {
                matched: {
                  $filter: {
                    input: "$stats",
                    as: "item",
                    cond: { $eq: ["$$item.status", "On Hold"] },
                  },
                },
              },
              in: { $ifNull: [{ $arrayElemAt: ["$$matched.count", 0] }, 0] },
            },
          },
        },
      },
    ];

    const results = await db.collection("loan_applications").aggregate(pipeline).toArray();
    res.json(results);
  } catch (error) {
    console.error("Error fetching monthly loan stats:", error);
    res.status(500).json({ error: "Failed to fetch monthly statistics" });
  }
});

router.get("/loan-type-stats", async (req, res) => {
  try {
    const collection = db.collection("loan_applications");

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
  // GET: Fetch a single application 
router.get("/:applicationId", async (req, res) => {
  const { applicationId } = req.params;

  try {
    const application = await db.collection("loan_applications").findOne({ applicationId });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.status(200).json(application);
  } catch (error) {
    console.error("Error fetching application by ID:", error);
    res.status(500).json({ error: "Failed to fetch application." });
  }
});

router.put("/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const updateData = req.body;

    console.log("Received PUT request for:", applicationId);
    console.log("Update data:", updateData);

    if (updateData.status === "Disbursed") {
      updateData.dateDisbursed = new Date();
    }

    const result = await loanApplications.updateOne(
      { applicationId: applicationId },
      { $set: updateData }
    );

    console.log("MongoDB update result:", result);

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Loan application not found." });
    }

    const updatedDoc = await loanApplications.findOne({ applicationId });

    res.status(200).json(updatedDoc);
  } catch (error) {
    console.error("Error in PUT /loan-applications/:applicationId:", error);
    res.status(500).json({ error: "Failed to update loan application." });
  }
});





  return router;
};