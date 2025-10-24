const { decrypt } = require("../Utils/crypt");
const { generateApplicationId } = require("../Utils/generator");
const { computeApplicationAmounts } = require("../Utils/loanCalculations");
const { encrypt } = require("../Utils/crypt");

function safeDecrypt(value) {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return value; 
  }
}

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

// Fetch all applications with decrypted fields
async function getAllApplications(repo) {
  const applications = await repo.getAllApplications();
  return applications.map(decryptApplication);
}

// Fetch interviews with partially decrypted fields
async function getInterviewList(repo) {
  const interviews = await repo.getInterviewList();
  return interviews.map(decryptInterview);
}

// Count applications by status
async function getStatusStats(repo) {
  const applied = await repo.countByStatus(/^applied$/i);
  const approved = await repo.countByStatus(/^approved$/i);
  const denied = await repo.countByStatus(/^denied$/i);
  return { applied, approved, denied };
}

// Aggregate loan type statistics
async function getLoanTypeStats(repo) {
  return await repo.getLoanTypeStats();
}

// Retrieve a single application by id
async function getApplicationById(repo, applicationId) {
  return await repo.getApplicationById(applicationId);
}

// Create a new loan application with validation and encryption
async function createLoanApplication(req, loanType, repo, db, uploadedFiles) {
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
  
    const profilePic = uploadedFiles.find(f => f.folder.includes("userProfilePictures"));
    const documents = uploadedFiles.filter(f => f.folder.includes("documents"));

    if (
      !documents ||
      (loanType === "without" && documents.length < 4) ||
      (loanType !== "without" && documents.length < 6)
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
    profilePic: profilePic
  ? {
      fileName: profilePic.fileName,
      filePath: profilePic.filePath,
      mimeType: profilePic.mimeType,
    }
  : null,
  documents,
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
  getApplicationById, 
  decryptApplication
};
