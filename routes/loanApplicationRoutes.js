const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["application/pdf", "image/png"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and PNG files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, 
});


function padId(num) {
  return num.toString().padStart(5, '0');
}

function processUploadedDocs(files) {
  if (!files || files.length === 0) {
    throw new Error("At least one document (PDF or PNG) is required.");
  }

  return files.map((file) => ({
    fileName: file.originalname,
    filePath: file.path,
    mimeType: file.mimetype,
  }));
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

  router.post("/without", upload.array("documents", 5), async (req, res) => {
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
  
      const names = new Map();
      const numbers = new Map();

      appReferences.forEach((r, idx) => {
        const nameKey = (r.name || "").trim().toLowerCase();
        const numKey = (r.contact || "").trim();
      
        if (nameKey) {
          if (!names.has(nameKey)) names.set(nameKey, []);
          names.get(nameKey).push(idx);
        }
        if (numKey) {
          if (!numbers.has(numKey)) numbers.set(numKey, []);
          numbers.get(numKey).push(idx);
        }
      });
      
      const dupNameIndices = [...names.values()].filter((arr) => arr.length > 1).flat();
      const dupNumberIndices = [...numbers.values()].filter((arr) => arr.length > 1).flat();
      
      if (dupNameIndices.length > 0 || dupNumberIndices.length > 0) {
        return res.status(400).json({
          error: "Reference names and contact numbers must be unique.",
          duplicates: {
            nameIndices: dupNameIndices,
            numberIndices: dupNumberIndices,
          },
        });
      }

      const uploadedDocs = processUploadedDocs(req.files);
  
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
  
      if (!Array.isArray(appReferences) || appReferences.length !== 3) {
        return res.status(400).json({ error: "Three references must be provided." });
      }
  
      for (const ref of appReferences) {
        if (!ref.name || !ref.contact || !ref.relation) {
          return res.status(400).json({ error: "Each reference must include name, contact, and relation." });
        }
      }

      const existing = await loanApplications.findOne({
        appName: appName.trim(),
        appDob: appDob.trim(),
        appContact: appContact.trim(),
        appEmail: appEmail.trim(),
        status: "Pending"
      });

      if (existing) {
        return res.status(400).json({
          error: "You already have a pending application with these details. Please wait for it to be processed."
        });
      }
  
      const applicationId = await generateApplicationId();
  
      const principal = Number(appLoanAmount);
      const interestRate = Number(appInterest);
      const terms = Number(appLoanTerms);

      const totalInterest = principal * (interestRate / 100) * terms;
      const totalPayable = principal + totalInterest;
  
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
        isReloan: false,
        documents: uploadedDocs,
      };
  
      if (newApplication.status === "Disbursed") {
        newApplication.dateDisbursed = new Date();
      }
  
      if (sourceOfIncome === "business") {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appTypeBusiness, appDateStarted, appBusinessLoc,
        };
      } else {
        newApplication = {
          ...newApplication,
          sourceOfIncome,
          appOccupation, appEmploymentStatus, appCompanyName,
        };
      }
  
      await loanApplications.insertOne(newApplication);
      res.status(201).json({
        message: "Loan application (no collateral) submitted successfully",
        application: newApplication,
      });
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
  router.post("/with", upload.array("documents", 5), async (req, res) => {
    try {
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, appReferences,
        collateralType, collateralValue, collateralDescription, ownershipStatus
      } = req.body;
  
      let parsedReferences = [];
      if (appReferences) {
        try {
          if (Array.isArray(appReferences)) {
            parsedReferences = appReferences;
          } else {
            parsedReferences = JSON.parse(appReferences);
          }
        } catch (err) {
          return res.status(400).json({ error: "Invalid format for references." });
        }
      }
  
      const names = new Map();
      const numbers = new Map();
  
      parsedReferences.forEach((r, idx) => {
        const nameKey = (r.name || "").trim().toLowerCase();
        const numKey = (r.contact || "").trim();
  
        if (nameKey) {
          if (!names.has(nameKey)) names.set(nameKey, []);
          names.get(nameKey).push(idx);
        }
        if (numKey) {
          if (!numbers.has(numKey)) numbers.set(numKey, []);
          numbers.get(numKey).push(idx);
        }
      });
  
      const dupNameIndices = [...names.values()].filter((arr) => arr.length > 1).flat();
      const dupNumberIndices = [...numbers.values()].filter((arr) => arr.length > 1).flat();
  
      if (dupNameIndices.length > 0 || dupNumberIndices.length > 0) {
        return res.status(400).json({
          error: "Reference names and contact numbers must be unique.",
          duplicates: {
            nameIndices: dupNameIndices,
            numberIndices: dupNumberIndices,
          },
        });
      }
  
      // ✅ Require at least 1 uploaded document
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "At least one document (PDF or PNG) is required." });
      }
  
      const uploadedDocs = processUploadedDocs(req.files);
  
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
  
      if (!Array.isArray(parsedReferences) || parsedReferences.length !== 3) {
        return res.status(400).json({ error: "Three references must be provided." });
      }
  
      for (const ref of parsedReferences) {
        if (!ref.name || !ref.contact || !ref.relation) {
          return res.status(400).json({ error: "Each reference must include name, contact, and relation." });
        }
      }
  
      const existing = await loanApplications.findOne({
        appName: appName.trim(),
        appDob: appDob.trim(),
        appContact: appContact.trim(),
        appEmail: appEmail.trim(),
        status: "Pending"
      });
  
      if (existing) {
        return res.status(400).json({
          error: "You already have a pending application with these details. Please wait for it to be processed."
        });
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
        dateApplied: new Date(),
        documents: uploadedDocs,
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