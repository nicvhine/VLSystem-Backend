const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const sharp = require("sharp"); 
const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const SECRET_KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY || "").padEnd(32, "0").slice(0, 32)
); 
const IV_LENGTH = 16; 

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}


function decrypt(text) {
  if (!text) return "";
  try {
    const [ivHex, encryptedHex] = text.split(":");
    if (!ivHex || !encryptedHex) return text; // if not encrypted
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return text;
  }
}

function safeDecrypt(value) {
  try {
    if (!value) return "";         
    return decrypt(value);        
  } catch (err) {
    return value;               
  }
}



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

// Multer filter
const fileFilter = (req, file, cb) => {
  const allowedDocs = ["application/pdf", "image/png"];
  const allowedPp = ["image/png"];

  if (file.fieldname === "documents") {
    if (allowedDocs.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF or PNG allowed for documents"), false);
  } else if (file.fieldname === "profilePic") {
    if (allowedPp.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG allowed for profile picture"), false);
  } else {
    cb(new Error("Unknown file field"), false);
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

async function validate2x2(req, res, next) {
  try {
    if (!req.files?.profilePic?.[0]) return next();

    const filePath = req.files.profilePic[0].path;
    const metadata = await sharp(filePath).metadata();

    // Check size: 2x2 inches = 600x600 pixels
    if (metadata.width !== 600 || metadata.height !== 600) {
      return res.status(400).json({
        error: "Profile picture must be 2x2 inches (600x600 pixels).",
      });
    }


    next();
  } catch (err) {
    console.error("Error validating profile picture:", err.message);
    res.status(500).json({ error: "Failed to validate profile picture." });
  }
}


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

  router.get("/", async (req, res) => {
    try {
      const applications = await loanApplications.find().toArray();
  
      const decryptedApps = applications.map(app => ({
        ...app,
        appName: decrypt(app.appName),
        appDob: app.appDob,
        appContact: decrypt(app.appContact),
        appEmail: decrypt(app.appEmail),
        appMarital: app.appMarital,
        appChildren: app.appChildren,
        appSpouseName: decrypt(app.appSpouseName),
        appSpouseOccupation: app.appSpouseOccupation,
        appAddress: decrypt(app.appAddress),
        appMonthlyIncome: app.appMonthlyIncome,
        appLoanPurpose: app.appLoanPurpose,
        appLoanAmount: app.appLoanAmount,
        appLoanTerms: app.appLoanTerms,
        appInterest: app.appInterest,
        appReferences: app.appReferences?.map(r => ({
          name: decrypt(r.name),
          contact: decrypt(r.contact),
          relation: r.relation
        })),
        collateralType: app.collateralType,
        collateralValue: app.collateralValue,
        collateralDescription: app.collateralDescription,
        ownershipStatus: app.ownershipStatus
      }));
  
      res.status(200).json(decryptedApps);
    } catch (error) {
      console.error("Error in GET /loan-applications:", error);
      res.status(500).json({ error: "Failed to fetch loan applications." });
    }
  });
  
  router.get("/interviews", authenticateToken, async (req, res) => {
    try {
      const interviews = await db.collection("loan_applications")
        .find({ interviewDate: { $exists: true } })
        .project({ applicationId: 1, appName: 1, interviewDate: 1, interviewTime: 1, status: 1, appAddress: 1, _id: 0 })
        .toArray();
  
      const decryptedInterviews = interviews.map(i => ({
        ...i,
        appName: i.appName ? decrypt(i.appName) : "",
        appAddress: i.appAddress ? decrypt(i.appAddress) : ""
      }));
  
      res.status(200).json(decryptedInterviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });
  
 // Add application endpoint
router.post(
  "/apply/:loanType",
  upload.fields([
    { name: "documents", maxCount: 6 },
    { name: "profilePic", maxCount: 1 }
  ]),
  validate2x2,
  async (req, res) => {
    try {
      const { loanType } = req.params; // "with", "without", "open-term"
      const {
        sourceOfIncome,
        appName, appDob, appContact, appEmail, appMarital, appChildren,
        appSpouseName, appSpouseOccupation, appAddress,
        appTypeBusiness, appBusinessName, appDateStarted, appBusinessLoc,
        appMonthlyIncome,
        appOccupation, appEmploymentStatus, appCompanyName,
        appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, appReferences, appAgent,
        collateralType, collateralValue, collateralDescription, ownershipStatus
      } = req.body;

      if (!appAgent) {
        return res.status(400).json({ error: "Agent must be selected for this application." });
      }
      const assignedAgent = await db.collection("agents").findOne({ agentId: appAgent });
      if (!assignedAgent) {
        return res.status(400).json({ error: "Selected agent does not exist." });
      }

      let parsedReferences = [];
      if (appReferences) {
        try {
          parsedReferences = typeof appReferences === "string" ? JSON.parse(appReferences) : appReferences;
        } catch (err) {
          return res.status(400).json({ error: "Invalid format for character references." });
        }
      }

      if (!Array.isArray(parsedReferences) || parsedReferences.length !== 3) {
        return res.status(400).json({ error: "Three references must be provided." });
      }

      const names = new Map();
      const numbers = new Map();

      parsedReferences.forEach((r, idx) => {
        const nameKey = (r.name || "").trim().toLowerCase();
        const numKey = (r.contact || "").trim();
        if (nameKey) names.set(nameKey, [...(names.get(nameKey) || []), idx]);
        if (numKey) numbers.set(numKey, [...(numbers.get(numKey) || []), idx]);
      });

      const dupNameIndices = [...names.values()].filter(arr => arr.length > 1).flat();
      const dupNumberIndices = [...numbers.values()].filter(arr => arr.length > 1).flat();
      if (dupNameIndices.length > 0 || dupNumberIndices.length > 0) {
        return res.status(400).json({
          error: "Reference names and contact numbers must be unique.",
          duplicates: { nameIndices: dupNameIndices, numberIndices: dupNumberIndices },
        });
      }

      const uploadedDocs = processUploadedDocs(req.files);
      if (!uploadedDocs || (loanType === "without" && uploadedDocs.length < 4) || (loanType !== "without" && uploadedDocs.length < 6)) {
        return res.status(400).json({
          error: loanType === "without"
            ? "4 supporting documents must be uploaded."
            : "6 supporting documents must be uploaded.",
        });
      }

      const uploadedPp = req.files.profilePic?.[0] ? {
        fileName: req.files.profilePic[0].originalname,
        filePath: req.files.profilePic[0].path,
        mimeType: req.files.profilePic[0].mimetype
      } : null;

      if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount || (loanType !== "open-term" && !appLoanTerms)) {
        return res.status(400).json({ error: "All required fields must be provided." });
      }

      if ((loanType === "with" || loanType === "open-term") && (!collateralType || !collateralValue || !collateralDescription || !ownershipStatus)) {
        return res.status(400).json({ error: "All collateral fields are required." });
      }

      if (sourceOfIncome === "business") {
        if (!appTypeBusiness || !appBusinessName || !appDateStarted || !appBusinessLoc || appMonthlyIncome == null) {
          return res.status(400).json({ error: "Business fields are required for business income source." });
        }
      } else if (sourceOfIncome === "employed") {
        if (!appOccupation || !appEmploymentStatus || !appCompanyName || appMonthlyIncome == null) {
          return res.status(400).json({ error: "Employment fields are required for employed income source." });
        }
      } else {
        return res.status(400).json({ error: "Invalid source of income." });
      }

      const existing = await loanApplications.findOne({
        appName: appName.trim(),
        appDob: appDob.trim(),
        appContact: appContact.trim(),
        appEmail: appEmail.trim(),
        status: "Pending"
      });
      if (existing) {
        return res.status(400).json({ error: "You already have a pending application with these details." });
      }

      const applicationId = await generateApplicationId();

      let principal = Number(appLoanAmount);
      let interestRate = Number(appInterest);
      let terms = Number(appLoanTerms) || 1;
      let interestAmount = 0;
      let periodAmount = principal;

      if (loanType !== "open-term") {
        interestAmount = principal * (interestRate / 100) * terms;
        periodAmount = (principal + interestAmount) / terms;
      }

      let totalPayable = principal + interestAmount;

      let appServiceFee = 0;
      if (principal >= 10000 && principal <= 20000) {
        appServiceFee = principal * 0.05;
      } else if (principal >= 25000 && principal <= 40000) {
        appServiceFee = 1000;
      } else if (principal >= 50000 && principal <= 500000) {
        appServiceFee = principal * 0.03;
      }

      const appNetReleased = principal - appServiceFee;

      let newApplication = {
        applicationId,
        appName: encrypt(appName),
        appDob,
        appContact: encrypt(appContact),
        appEmail: encrypt(appEmail),
        appMarital,
        appChildren,
        appSpouseName: encrypt(appSpouseName),
        appSpouseOccupation,
        appAddress: encrypt(appAddress),
        appMonthlyIncome: appMonthlyIncome?.toString(),
        appLoanPurpose,
        appLoanAmount: principal.toString(),
        appLoanTerms: terms.toString(),
        appInterest: interestRate.toString(),
        appTotalInterest: interestAmount,
        appTotalPayable: totalPayable,
        appMonthlyDue: periodAmount,
        appServiceFee,
        appNetReleased,

        appReferences: parsedReferences.map(r => ({
          name: encrypt(r.name),
          contact: encrypt(r.contact),
          relation: r.relation
        })),

        appAgent: {
          id: assignedAgent.agentId,
          name: assignedAgent.name  
        },

        hasCollateral: loanType !== "without",
        collateralType,
        collateralValue: collateralValue?.toString(),
        collateralDescription,
        ownershipStatus,

        loanType: loanType === "without" ? "Regular Loan Without Collateral" : loanType === "with" ? "Regular Loan With Collateral" : "Open-Term Loan",
        status: "Applied",
        dateApplied: new Date(),
        documents: uploadedDocs,
        profilePic: uploadedPp
      };

      if (sourceOfIncome === "business") {
        newApplication = { ...newApplication, sourceOfIncome, appTypeBusiness, appBusinessName, appDateStarted, appBusinessLoc };
      } else {
        newApplication = { ...newApplication, sourceOfIncome, appOccupation, appEmploymentStatus, appCompanyName };
      }

      await loanApplications.insertOne(newApplication);

      res.status(201).json({
        message: loanType === "without"
          ? "Loan application (no collateral) submitted successfully"
          : loanType === "with"
            ? "Loan application (with collateral) submitted successfully"
            : "Open-term loan application submitted successfully",
        application: newApplication
      });

    } catch (error) {
      console.error("Error in /loan-applications/apply/:loanType:", error);
      res.status(500).json({ error: "Failed to submit loan application." });
    }
  }
);

  
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
      status: "Applied",
      dateApplied: new Date(),
    };

    if (latestLoan.sourceOfIncome === "business") {
      reloanApplication.appTypeBusiness = latestLoan.appTypeBusiness;
      reloanApplication.appBusinessName = latestLoan.appBusinessName;
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
  
  //fetch loan statistics
  router.get("/applicationStatus-stats", async (req, res) => {
    try {
      const collection = db.collection("loan_applications");
  
      const applied = await collection.countDocuments({ status: { $regex: /^applied$/i } });
      const approved = await collection.countDocuments({ status: { $regex: /^approved$/i } });
      const denied = await collection.countDocuments({ status: { $regex: /^denied$/i } });

  
      res.json({
        approved,
        denied,
        applied
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

    // Decrypt sensitive fields
    const decryptedApp = {
      ...application,
      appName: decrypt(application.appName),
      appDob: application.appDob,
      appContact: decrypt(application.appContact),
      appEmail: decrypt(application.appEmail),
      appAddress: decrypt(application.appAddress),
      appLoanPurpose: application.appLoanPurpose,
      appLoanAmount: application.appLoanAmount,
      appLoanTerms: application.appLoanTerms,
      appInterest: application.appInterest,
      appReferences: application.appReferences?.map(r => ({
        name: decrypt(r.name),
        contact: decrypt(r.contact),
        relation: r.relation
      })),
      collateralType: application.collateralType,
      collateralValue: application.collateralValue,
      collateralDescription: application.collateralDescription,
      ownershipStatus: application.ownershipStatus
    };

    res.status(200).json(decryptedApp);
  } catch (error) {
    console.error("Error fetching application by ID:", error);
    res.status(500).json({ error: "Failed to fetch application." });
  }
});

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

    const loanApplications = db.collection("loan_applications");
    const agents = db.collection("agents");

    const existingApp = await loanApplications.findOne({ applicationId });
    if (!existingApp) {
      return res.status(404).json({ error: "Loan application not found." });
    }

    await loanApplications.updateOne({ applicationId }, { $set: updateData });
    const updatedDoc = await loanApplications.findOne({ applicationId });

    if (
      typeof updateData.status === "string" &&
      updateData.status.trim().toLowerCase() === "disbursed"
    ) {
      const appAgent = existingApp.appAgent;
      const loanAmount = parseFloat(existingApp.appLoanAmount || 0);

      if (appAgent && (appAgent.agentId || appAgent.id)) {
        const agentId = appAgent.agentId || appAgent.id;      
        const commissionRate = 0.05; 
        const commission = loanAmount * commissionRate;

        await agents.updateOne(
          { agentId },
          {
            $inc: {
              handledLoans: 1,
              totalLoanAmount: loanAmount,
              totalCommission: commission,
            },
          }
        );

        console.log(
          `[AGENT UPDATE] Updated agent ${agentId}: +1 handledLoan, +₱${loanAmount}, +₱${commission} commission`
        );
      } else {
        console.warn(`[AGENT UPDATE] No agentId found for application ${applicationId}`);
      }
    }

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
      "loan officer": "manager_notifications",
    };

    const targetCollectionName = roleToCollection[actorRole];

    console.log("[NOTIFICATION DEBUG]", {
      actorRole,
      rawRole,
      prevStatus,
      nextStatus,
      statusChanged: changed,
      targetCollection: targetCollectionName,
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
        previousStatus: prevStatus,
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
        targetCollection: targetCollectionName,
      },
    });
  } catch (error) {
    console.error("Error in PUT /loan-applications/:applicationId:", error);
    res.status(500).json({ error: "Failed to update loan application." });
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

  return router;
};