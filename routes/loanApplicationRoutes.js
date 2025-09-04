const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");

//authenticator
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; 

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user; 
    next();
  });
}

//for document upload
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
  fileFilter: (req, file, cb) => {
    const allowedDocs = ["application/pdf", "image/png"];
    const allowedPp = ["image/jpeg", "image/png"];
    
    if (file.fieldname === "documents") {
      if (allowedDocs.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only PDF and PNG allowed for documents"));
    } else if (file.fieldname === "profilePic") {
      if (allowedPp.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only JPEG or PNG allowed for profile picture"));
    } else {
      cb(new Error("Unknown file field"), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});


//id format
function padId(num) {
  return num.toString().padStart(5, '0');
}

//docs checker
function processUploadedDocs(files) {
  if (!files || Object.keys(files).length === 0) {
    throw new Error("At least one document (PDF or PNG) is required.");
  }

  // Flatten all file arrays into a single array
  const allFiles = Object.values(files).flat();

  return allFiles.map((file) => ({
    fileName: file.originalname,
    filePath: file.path,
    mimeType: file.mimetype,
  }));
}


module.exports = (db) => {
  const loanApplications = db.collection("loan_applications");

  //id generator
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

  //fetch interview list
  router.get("/interviews", authenticateToken, async (req, res) => {
    try {
      const interviews = await db.collection("loan_applications")
        .find({ interviewDate: { $exists: true } })
        .project({ applicationId: 1, appName: 1, interviewDate: 1, interviewTime: 1, status: 1, appAddress: 1, _id: 0 })
        .toArray();
      
      res.status(200).json(interviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  //add application without
  router.post("/without", upload.fields([
    { name: "documents", maxCount: 5 },
    { name: "profilePic", maxCount: 1 }
  ]), async (req, res) => {
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

      let uploadedPp = null;
      if (req.files.profilePic && req.files.profilePic[0]) {
        uploadedPp = {
          fileName: req.files.profilePic[0].originalname,
          filePath: req.files.profilePic[0].path,
          mimeType: req.files.profilePic[0].mimetype
        };
      }

  
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
        profilePic: uploadedPp,
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
  
//add application reloan-without
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

  //add application with
  router.post("/with", upload.fields([
    { name: "documents", maxCount: 5 },
    { name: "profilePic", maxCount: 1 }
  ]), async (req, res) => {
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
  
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "At least one document (PDF or PNG) is required." });
      }
  
      const uploadedDocs = processUploadedDocs(req.files);
  
      let uploadedPp = null;
      if (req.files.profilePic && req.files.profilePic[0]) {
        uploadedPp = {
          fileName: req.files.profilePic[0].originalname,
          filePath: req.files.profilePic[0].path,
          mimeType: req.files.profilePic[0].mimetype
        };
      }
      
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
        profilePic: uploadedPp,
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
  

  //add application open-term
  router.post("/open-term", upload.fields([
    { name: "documents", maxCount: 5 },
    { name: "profilePic", maxCount: 1 }
  ]), async (req, res) => {    try {
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

      const uploadedDocs = processUploadedDocs(req.files);

      let uploadedPp = null;
      if (req.files.profilePic && req.files.profilePic[0]) {
        uploadedPp = {
          fileName: req.files.profilePic[0].originalname,
          filePath: req.files.profilePic[0].path,
          mimeType: req.files.profilePic[0].mimetype
        };
      }

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
        loanType: "Open-Term Loan",
        status: "Pending",
        dateApplied: new Date(),
        documents: uploadedDocs,
        profilePic: uploadedPp,
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

  //fetch all loan applications
  router.get("/", async (req, res) => {
    try {
      const applications = await loanApplications.find().toArray();
      res.status(200).json(applications);
    } catch (error) {
      console.error("Error in GET /loan-applications:", error);
      res.status(500).json({ error: "Failed to fetch loan applications." });
    }
  });

  //fetch loan statistics
  router.get("/loan-stats", async (req, res) => {
    try {
      const collection = db.collection("loan_applications");
  
      const [approved, denied, pending, onHold] = await Promise.all([
        collection.countDocuments({ status: { $regex: /^accepted$/i } }),
        collection.countDocuments({ status: { $regex: /^denied by LO$/i } }),
        collection.countDocuments({ status: { $regex: /^pending$/i } }),
        collection.countDocuments({ status: { $regex: /^on hold$/i } }),
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
    
//fetch monthlt loan stats for the graph
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

//fetch loan stats for loan type
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

//fetch application by Id
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

//edit application by id
router.put("/:applicationId", authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const updateData = req.body;

    console.log("[PUT] Incoming request for", applicationId, updateData);

    if (
      typeof updateData.status === "string" &&
      updateData.status.trim().toLowerCase() === "disbursed"
    ) {
      updateData.dateDisbursed = new Date();
    }

    //find existing app
    const existingApp = await loanApplications.findOne({ applicationId });
    if (!existingApp) {
      return res.status(404).json({ error: "Loan application not found." });
    }

    //if status is denied by lo, delete
    if (
      typeof updateData.status === "string" &&
      updateData.status.trim().toLowerCase() === "denied by lo"
    ) {
      await loanApplications.deleteOne({ applicationId });
      return res.status(200).json({
        message: `Application ${applicationId} has been denied and deleted from records.`,
        deleted: true
      });
    }

    await loanApplications.updateOne({ applicationId }, { $set: updateData });

    const updatedDoc = await loanApplications.findOne({ applicationId });

    function normalizeRole(role) {
      return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " "); 
    }

    const rawRole =
      (req.user && req.user.role) ||
      req.headers["x-user-role"] ||
      "";

    const actorRole = normalizeRole(rawRole);

    const prevStatus = String(existingApp.status || "");
    const nextStatus = String(updatedDoc.status || updateData.status || "");
    const changed =
      nextStatus.trim().toLowerCase() !== prevStatus.trim().toLowerCase();

    const roleToCollection = {
      manager: "loanOfficer_notifications",       
      "loan officer": "manager_notifications"   
    };

    const targetCollectionName = roleToCollection[actorRole];

    console.log("[NOTIFICATION DEBUG]", {
      actorRole,
      rawRole,
      prevStatus,
      nextStatus,
      statusChanged: changed,
      targetCollection: targetCollectionName
    });

    if (changed && targetCollectionName) {
      const message =
        actorRole === "manager"
          ? `Manager has changed application ${applicationId} to "${nextStatus}"`
          : `Loan Officer has changed application ${applicationId} to ${nextStatus}`;

      const notificationDoc = {
        applicationId,
        message,
        status: nextStatus,
        createdAt: new Date(),
        read: false,
        actorRole,
        previousStatus: prevStatus
      };

      await db.collection(targetCollectionName).insertOne(notificationDoc);

      console.log(
        "[NOTIFICATION DEBUG] Inserted into",
        targetCollectionName,
        notificationDoc
      );
    } else if (!changed) {
      console.log("[NOTIFICATION DEBUG] No status change, skipping insert.");
    } else {
      console.log("[NOTIFICATION DEBUG] Unknown role, skipping insert.");
    }

    res.status(200).json({
      ...updatedDoc,
      _debug: {
        actorRole,
        prevStatus,
        nextStatus,
        statusChanged: changed,
        targetCollection: targetCollectionName
      }
    });
  } catch (error) {
    console.error("Error in PUT /loan-applications/:applicationId:", error);
    res
      .status(500)
      .json({ error: "Failed to update loan application." });
  }
});

//update interview schedule 
router.put("/:applicationId/schedule-interview", authenticateToken, async (req, res) => {
  const { applicationId } = req.params;
  const { interviewDate, interviewTime } = req.body;

  if (!interviewDate || !interviewTime) {
    return res.status(400).json({ error: "Date and time are required" });
  }

  try {
    const loanApplications = db.collection("loan_applications");
    const result = await loanApplications.updateOne(
      { applicationId },
      { $set: { interviewDate, interviewTime } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json({ message: "Interview scheduled successfully" });
  } catch (error) {
    console.error("Error scheduling interview:", error);
    res.status(500).json({ error: "Failed to schedule interview" });
  }
});

//cleanup if no sched after 7 days
router.delete("/cleanup/unscheduled", async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await loanApplications.deleteMany({
      interviewDate: { $exists: false },
      dateApplied: { $lte: sevenDaysAgo },
    });

    res.status(200).json({
      message: `Deleted ${result.deletedCount} unscheduled applications older than 7 days.`,
    });
  } catch (error) {
    console.error("Error cleaning up unscheduled applications:", error);
    res.status(500).json({ error: "Failed to clean up unscheduled applications." });
  }
});

// test delete if no sched after 1 minute
cron.schedule("* * * * *", async () => {
  try {
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

    const result = await loanApplications.deleteMany({
      interviewDate: { $exists: false },
      dateApplied: { $lte: oneMinuteAgo },
    });

    if (result.deletedCount > 0) {
      console.log(`[CRON] Deleted ${result.deletedCount} unscheduled applications older than 1 minute.`);
    } else {
      console.log("[CRON] No unscheduled applications to delete.");
    }
  } catch (error) {
    console.error("[CRON] Cleanup job failed:", error);
  }
});

  return router;
};