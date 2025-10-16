const { decrypt } = require("../utils/crypt");
const { generateApplicationId } = require("../utils/generator");
const { computeApplicationAmounts } = require("../utils/loanCalculations");
const { encrypt } = require("../utils/crypt");
const { processUploadedDocs } = require("../utils/uploadConfig");
const path = require("path");
const fs = require("fs");

// ---------- HELPERS ----------
const decryptApplication = (app) => ({
  ...app,
  appName: decrypt(app.appName),
  appContact: decrypt(app.appContact),
  appEmail: decrypt(app.appEmail),
  appSpouseName: decrypt(app.appSpouseName),
  appAddress: decrypt(app.appAddress),
  appReferences: app.appReferences?.map((r) => ({
    name: decrypt(r.name),
    contact: decrypt(r.contact),
    relation: r.relation,
  })),
});

const decryptInterview = (interview) => ({
  ...interview,
  appName: interview.appName ? decrypt(interview.appName) : "",
  appAddress: interview.appAddress ? decrypt(interview.appAddress) : "",
});

// ---------- SERVICE FUNCTIONS ----------
async function getAllApplications(repo) {
  const applications = await repo.getAllApplications();
  return applications.map(decryptApplication);
}

async function getInterviewList(repo) {
  const interviews = await repo.getInterviewList();
  return interviews.map(decryptInterview);
}

async function getStatusStats(repo) {
  const applied = await repo.countByStatus(/^applied$/i);
  const approved = await repo.countByStatus(/^approved$/i);
  const denied = await repo.countByStatus(/^denied$/i);
  return { applied, approved, denied };
}

async function getLoanTypeStats(repo) {
  return await repo.getLoanTypeStats();
}

// ---------- CREATE LOAN APPLICATION ----------
async function createLoanApplication(req, loanType, repo, db) {
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

  if (!appAgent) throw new Error("Agent must be selected for this application.");
  const assignedAgent = await repo.findAgentById(appAgent);
  if (!assignedAgent) throw new Error("Selected agent does not exist.");

  // Validate references
  let parsedReferences = [];
  try {
    parsedReferences = typeof appReferences === "string" ? JSON.parse(appReferences) : appReferences;
  } catch {
    throw new Error("Invalid format for character references.");
  }

  if (!Array.isArray(parsedReferences) || parsedReferences.length !== 3)
    throw new Error("Three references must be provided.");

  const names = new Map();
  const numbers = new Map();
  parsedReferences.forEach((r, idx) => {
    const nameKey = (r.name || "").trim().toLowerCase();
    const numKey = (r.contact || "").trim();
    if (nameKey) names.set(nameKey, [...(names.get(nameKey) || []), idx]);
    if (numKey) numbers.set(numKey, [...(numbers.get(numKey) || []), idx]);
  });
  if ([...names.values(), ...numbers.values()].some(arr => arr.length > 1))
    throw new Error("Reference names and contact numbers must be unique.");

  // ✅ Upload documents and profile picture using Cloudinary helper
  const uploadedFiles = await processUploadedDocs(req.files);

  const uploadedDocs = uploadedFiles.filter(
    (f) => f.mimeType === "pdf" || f.mimeType === "png"
  );

  const uploadedPp = uploadedFiles.find(
    (f) => f.mimeType === "jpeg" || f.mimeType === "jpg" || f.mimeType === "png"
  );

  // ✅ Validate required uploads
  if (
    !uploadedDocs ||
    (loanType === "without" && uploadedDocs.length < 4) ||
    (loanType !== "without" && uploadedDocs.length < 6)
  ) {
    throw new Error(
      loanType === "without"
        ? "4 supporting documents must be uploaded."
        : "6 supporting documents must be uploaded."
    );
  }

  if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount)
    throw new Error("All required fields must be provided.");

  if (loanType !== "open-term" && !appLoanTerms)
    throw new Error("Loan terms are required.");

  if ((loanType === "with" || loanType === "open-term") &&
      (!collateralType || !collateralValue || !collateralDescription || !ownershipStatus))
    throw new Error("All collateral fields are required.");

  if (sourceOfIncome === "business") {
    if (!appTypeBusiness || !appBusinessName || !appDateStarted || !appBusinessLoc || appMonthlyIncome == null)
      throw new Error("Business fields are required for business income source.");
  } else if (sourceOfIncome === "employed") {
    if (!appOccupation || !appEmploymentStatus || !appCompanyName || appMonthlyIncome == null)
      throw new Error("Employment fields are required for employed income source.");
  } else {
    throw new Error("Invalid source of income.");
  }

  const existing = await repo.findPendingByApplicant(appName, appDob, appContact, appEmail);
  if (existing) throw new Error("You already have a pending application with these details.");

  const applicationId = await generateApplicationId(repo.loanApplications);

  const principal = Number(appLoanAmount);
  const interestRate = Number(appInterest);
  const terms = Number(appLoanTerms) || 1;

  const {
    interestAmount,
    totalInterestAmount,
    totalPayable,
    appServiceFee,
    appNetReleased,
    appMonthlyDue,
  } = computeApplicationAmounts(principal, interestRate, terms, loanType);

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
    appInterestRate: interestRate.toString(),
    appInterestAmount: interestAmount,
    appTotalInterestAmount: totalInterestAmount,
    appTotalPayable: totalPayable,
    appMonthlyDue,
    appServiceFee,
    appNetReleased,
    appReferences: parsedReferences.map((r) => ({
      name: encrypt(r.name),
      contact: encrypt(r.contact),
      relation: r.relation,
    })),
    appAgent: { id: assignedAgent.agentId, name: assignedAgent.name },
    hasCollateral: loanType !== "without",
    collateralType,
    collateralValue: collateralValue?.toString(),
    collateralDescription,
    ownershipStatus,
    loanType:
      loanType === "without"
        ? "Regular Loan Without Collateral"
        : loanType === "with"
        ? "Regular Loan With Collateral"
        : "Open-Term Loan",
    status: "Applied",
    dateApplied: new Date(),
    documents: uploadedDocs,
    profilePic: uploadedPp || null,
  };

  if (sourceOfIncome === "business") {
    newApplication = { ...newApplication, sourceOfIncome, appTypeBusiness, appBusinessName, appDateStarted, appBusinessLoc };
  } else {
    newApplication = { ...newApplication, sourceOfIncome, appOccupation, appEmploymentStatus, appCompanyName };
  }

  await repo.insertLoanApplication(newApplication);
  return newApplication;
}

module.exports = {
  getAllApplications,
  getInterviewList,
  getStatusStats,
  getLoanTypeStats,
  createLoanApplication,
};
