'use strict';

const { decrypt, encrypt } = require("../Utils/crypt");
const { generateApplicationId } = require("../Utils/generator");

/**
 * Computes loan amounts including interest, service fee, monthly dues, and net proceeds.
 * @param {number} principal 
 * @param {number} interestRate - in %
 * @param {number} terms - months, use 1 if open-term
 * @param {"with"|"without"|"open-term"} loanType 
 */
function computeApplicationAmounts(principal, interestRate, terms, loanType) {
  const appInterestAmount = principal * (interestRate / 100);
  const appTotalInterestAmount = appInterestAmount * (terms || 1);
  const appTotalPayable = principal + appTotalInterestAmount;
  const appMonthlyDue = loanType !== "open-term" ? appTotalPayable / (terms || 1) : 0;

  let appServiceFee = 0;
  if (principal >= 10000 && principal <= 20000) appServiceFee = principal * 0.05;
  else if (principal > 20000 && principal <= 45000) appServiceFee = 1000;
  else if (principal > 45000) appServiceFee = principal * 0.03;

  const appNetReleased = principal - appServiceFee;

  return { appInterestAmount, appTotalInterestAmount, appTotalPayable, appMonthlyDue, appServiceFee, appNetReleased };
}

/**
 * Creates a re-loan application
 * @param {object} req - Express request object
 * @param {"with"|"without"|"open-term"} loanType
 * @param {object} repo - repository with DB access
 * @param {object} db
 * @param {Array} uploadedFiles - files uploaded
 */
async function createReloanApplication(req, loanType, repo, db, uploadedFiles) {
  const {
    borrowersId,
    previousBalance = 0,
    balanceDecision = "deduct",
    sourceOfIncome,
    appName, appDob, appContact, appEmail, appMarital, appChildren,
    appSpouseName, appSpouseOccupation, appAddress,
    appTypeBusiness, appBusinessName, appDateStarted, appBusinessLoc,
    appMonthlyIncome,
    appOccupation, appEmploymentStatus, appCompanyName,
    appLoanPurpose, appLoanAmount, appLoanTerms, appInterest, appReferences, appAgent,
    collateralType, collateralValue, collateralDescription, ownershipStatus
  } = req.body;

  // --- Validate agent ---
  if (!appAgent) throw new Error("Agent must be selected.");
  const assignedAgent = await repo.findAgentById(appAgent);
  if (!assignedAgent) throw new Error("Selected agent does not exist.");

  // --- Validate references ---
  let parsedReferences = [];
  try {
    parsedReferences = typeof appReferences === "string" ? JSON.parse(appReferences) : appReferences;
  } catch {
    throw new Error("Invalid format for references.");
  }
  if (!Array.isArray(parsedReferences) || parsedReferences.length !== 3)
    throw new Error("Three references must be provided.");

  // --- Validate uploads ---
  const profilePic = uploadedFiles.find(f => f.folder.includes("userProfilePictures")) || null;
  const documents = uploadedFiles.filter(f => f.folder.includes("documents")) || [];
  if (documents.length < 4) throw new Error("At least 4 supporting documents must be uploaded.");

  // --- Validate required fields ---
  if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appLoanPurpose || !appLoanAmount)
    throw new Error("All required fields must be provided.");

  // --- Generate application ID ---
  const applicationId = await generateApplicationId(repo.loanApplications);

  // --- Parse numeric fields ---
  const principal = Number(appLoanAmount);
  const interestRate = Number(appInterest || 0);
  const terms = Number(appLoanTerms || 1);
  const prevBalanceNum = Number(previousBalance || 0);

  // --- Compute base loan amounts ---
  let amounts = computeApplicationAmounts(principal, interestRate, terms, loanType);
  let appNewLoanAmount = principal;

  // --- Handle previous balance ---
  if (prevBalanceNum > 0) {
    if (balanceDecision === "deduct") {
      amounts.appNetReleased = principal - amounts.appServiceFee - prevBalanceNum;
      if (amounts.appNetReleased < 0) amounts.appNetReleased = 0;
    } else if (balanceDecision === "addPrincipal") {
      appNewLoanAmount = principal + prevBalanceNum;
      amounts = computeApplicationAmounts(appNewLoanAmount, interestRate, terms, loanType);
    }
  }

  // --- Build application object ---
  const newApplication = {
    applicationId,
    borrowersId: borrowersId || null,
    appName: encrypt(appName),
    appDob,
    appContact: encrypt(appContact),
    appEmail: encrypt(appEmail),
    appMarital,
    appChildren,
    appSpouseName: encrypt(appSpouseName || ""),
    appSpouseOccupation: appSpouseOccupation || "",
    appAddress: encrypt(appAddress),
    appMonthlyIncome: appMonthlyIncome?.toString() || "0",
    appLoanPurpose,
    appLoanAmount: appNewLoanAmount.toString(),
    appLoanTerms: terms.toString(),
    appInterestRate: interestRate.toString(),
    appInterestAmount: amounts.appInterestAmount,
    appTotalInterestAmount: amounts.appTotalInterestAmount,
    appTotalPayable: amounts.appTotalPayable,
    appMonthlyDue: amounts.appMonthlyDue,
    appServiceFee: amounts.appServiceFee,
    appNetReleased: amounts.appNetReleased,
    appReferences: parsedReferences.map((r) => ({
      name: encrypt(r.name),
      contact: encrypt(r.contact),
      relation: r.relation,
    })),
    appAgent: { id: assignedAgent.agentId, name: assignedAgent.name },
    hasCollateral: loanType !== "without",
    collateralType: collateralType || null,
    collateralValue: collateralValue?.toString() || "0",
    collateralDescription: collateralDescription || null,
    ownershipStatus: ownershipStatus || null,
    loanType: loanType === "without" ? "Regular Loan Without Collateral" : "Regular Loan With Collateral",
    status: "Applied",
    isReloan: true,
    previousBalance: prevBalanceNum,
    balanceDecision,
    dateApplied: new Date(),
    profilePic: profilePic
      ? {
          fileName: profilePic.fileName,
          filePath: profilePic.filePath,
          mimeType: profilePic.mimeType,
        }
      : null,
    documents,
    sourceOfIncome,
  };

  // --- Add income details ---
  if (sourceOfIncome === "business") {
    newApplication.appTypeBusiness = appTypeBusiness || "";
    newApplication.appBusinessName = appBusinessName || "";
    newApplication.appDateStarted = appDateStarted || "";
    newApplication.appBusinessLoc = appBusinessLoc || "";
  } else {
    newApplication.appOccupation = appOccupation || "";
    newApplication.appEmploymentStatus = appEmploymentStatus || "";
    newApplication.appCompanyName = appCompanyName || "";
  }

  // --- Insert into repository ---
  await repo.insertLoanApplication(newApplication);

  if (newApplication.borrowersId) {
    const notification = {
      borrowersId: newApplication.borrowersId,
      message: `Your re-loan application (${newApplication.applicationId}) has been submitted successfully.`,
      read: false,
      viewed: false,
      createdAt: new Date(),
    };

    // Directly insert into MongoDB collection
    const notificationsCollection = db.collection("borrower_notifications");
    await notificationsCollection.insertOne(notification);
  }
  
  return newApplication;
}

module.exports = {
  createReloanApplication
};
