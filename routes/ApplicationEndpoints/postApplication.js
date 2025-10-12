const express = require('express');
const router = express.Router();

const { upload, validate2x2, processUploadedDocs } = require("../../utils/upload");
const { generateApplicationId } = require("../../utils/generator");
const { computeApplicationAmounts } = require('../../utils/loanCalculations');

const { encrypt } = require('../../utils/crypt'); 

module.exports = (db) => {
  const loanApplications = db.collection("loan_applications");

    // Add application 
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

        console.log("appAgent received from frontend:", appAgent);

        if (!appAgent) {
            return res.status(400).json({ error: "Agent must be selected for this application." });
        }
        
        let assignedAgent;
        try {
            assignedAgent = await db.collection("agents").findOne({ agentId: appAgent });
            if (!assignedAgent) {
            return res.status(400).json({ error: "Selected agent does not exist." });
            }
            } catch {
            return res.status(400).json({ error: "Invalid agent ID format." });
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

        const applicationId = await generateApplicationId(loanApplications);

        const principal = Number(appLoanAmount);
        const interestRate = Number(appInterest);
        const terms = Number(appLoanTerms) || 1;

        const { interestAmount, totalInterestAmount, totalPayable, appServiceFee, appNetReleased, appMonthlyDue } = 
            computeApplicationAmounts(principal, interestRate, terms, loanType);


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

            //interest
            appInterestRate: interestRate.toString(),
            appInterestAmount: interestAmount,
            appTotalInterestAmount: totalInterestAmount,

            appTotalPayable: totalPayable,
            appMonthlyDue,
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

  return router;
}