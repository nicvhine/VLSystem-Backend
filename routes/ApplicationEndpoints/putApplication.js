const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth'); 
const authorizeRole = require('../../Middleware/authorizeRole');
const { computeLoanFields } = require('../../Services/loanApplicationService');

const loanOptions = {
  withCollateral: [
    { amount: 20000, months: 8, interest: 7 },
    { amount: 50000, months: 10, interest: 5 },
    { amount: 100000, months: 18, interest: 4 },
    { amount: 200000, months: 24, interest: 3 },
    { amount: 300000, months: 36, interest: 2 },
    { amount: 500000, months: 60, interest: 1.5 },
  ],
  withoutCollateral: [
    { amount: 10000, months: 5, interest: 10 },
    { amount: 15000, months: 6, interest: 10 },
    { amount: 20000, months: 8, interest: 10 },
    { amount: 30000, months: 10, interest: 10 },
  ],
  openTerm: [
    { amount: 50000, interest: 6 },
    { amount: 100000, interest: 5 },
    { amount: 200000, interest: 4 },
    { amount: 500000, interest: 3 },
  ],
};

module.exports = (db) => {
const loanApplications = db.collection("loan_applications");

router.put("/:applicationId", authenticateToken, authorizeRole("manager", "loan officer"), async (req, res) => {
  try {
    const { applicationId } = req.params;
    const updateData = req.body;

    console.log("[PUT] Incoming request for", applicationId, updateData);

    // Add disbursed date if status is "Disbursed"
    if (typeof updateData.status === "string" && updateData.status.trim().toLowerCase() === "disbursed") {
      updateData.dateDisbursed = new Date();
    }

    const loanApplications = db.collection("loan_applications");
    const agents = db.collection("agents");

    // Fetch existing application
    const existingApp = await loanApplications.findOne({ applicationId });
    if (!existingApp) {
      return res.status(404).json({ error: "Loan application not found." });
    }

    // Update the loan application
    await loanApplications.updateOne({ applicationId }, { $set: updateData });
    const updatedDoc = await loanApplications.findOne({ applicationId });

    // Respond immediately
    res.status(200).json({
      ...updatedDoc,
      _debug: { statusUpdated: true },
    });

    // Asynchronous post-update operations
    (async () => {
      try {
        // Update agent stats if disbursed
        if (typeof updateData.status === "string" && updateData.status.trim().toLowerCase() === "disbursed") {
          const appAgent = existingApp.appAgent;
          const loanAmount = parseFloat(existingApp.appLoanAmount || 0);

          if (appAgent && (appAgent.agentId || appAgent.id)) {
            const agentId = appAgent.agentId || appAgent.id;
            const commissionRate = 0.05;
            const commission = loanAmount * commissionRate;

            await agents.updateOne(
              { agentId },
              { $inc: { handledLoans: 1, totalLoanAmount: loanAmount, totalCommission: commission } }
            );

            console.log(`[AGENT UPDATE] Updated agent ${agentId}: +1 handledLoan, +₱${loanAmount}, +₱${commission} commission`);
          } else {
            console.warn(`[AGENT UPDATE] No agentId found for application ${applicationId}`);
          }
        }

        // Handle notifications
        function normalizeRole(role) {
          return String(role || "").trim().toLowerCase().replace(/[_-]+/g, " ");
        }

        const rawRole = (req.user && req.user.role) || req.headers["x-user-role"] || "";
        const actorRole = normalizeRole(rawRole);

        const prevStatus = String(existingApp.status || "");
        const nextStatus = String(updatedDoc.status || updateData.status || "");
        const changed = nextStatus.trim().toLowerCase() !== prevStatus.trim().toLowerCase();

        const roleToCollection = {
          manager: "loanOfficer_notifications",
          "loan officer": "manager_notifications",
        };

        const targetCollectionName = roleToCollection[actorRole];

        if (changed && targetCollectionName) {
          const actorName = req.user?.fullName || req.user?.name || req.user?.username || req.user?.email || "Unknown";
          const actorProfilePic = req.user?.profilePic || req.user?.photo || req.user?.avatar || "";

          const message =
            actorRole === "manager"
              ? `${actorName} (Manager) has changed application ${applicationId} to "${nextStatus}"`
              : `${actorName} (Loan Officer) has changed application ${applicationId} to ${nextStatus}`;

          const notificationDoc = {
            applicationId,
            message,
            status: nextStatus,
            createdAt: new Date(),
            read: false,
            actorRole,
            actorName,
            actorProfilePic,
            previousStatus: prevStatus,
          };

          await db.collection(targetCollectionName).insertOne(notificationDoc);
          console.log("[NOTIFICATION DEBUG] Inserted into", targetCollectionName, notificationDoc);
        }
      } catch (asyncErr) {
        console.error("[ASYNC POST-UPDATE ERROR]", asyncErr);
      }
    })();

  } catch (error) {
    console.error("Error in PUT /loan-applications/:applicationId:", error);
    res.status(500).json({ error: "Failed to update loan application." });
  }
});


// Update interview schedule for an application 
router.put("/:applicationId/schedule-interview", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    const { applicationId } = req.params;
    const { interviewDate, interviewTime } = req.body;
  
    if (!interviewDate || !interviewTime) {
      return res.status(400).json({ error: "Date and time are required" });
    }
  
    try {
      const result = await loanApplications.updateOne(
        { applicationId },
        { 
          $set: { 
            interviewDate, 
            interviewTime,
            status: "Pending"
          } 
        }
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
  
  router.put("/:applicationId/principal", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { newPrincipal } = req.body;
  
      const existingApp = await loanApplications.findOne({ applicationId });
      if (!existingApp) return res.status(404).json({ error: "Loan not found" });
  
      // Determine the loan type key
      let optionKey = "";
      if (existingApp.loanType?.includes("With Collateral")) optionKey = "withCollateral";
      else if (existingApp.loanType?.includes("Without Collateral")) optionKey = "withoutCollateral";
      else optionKey = "openTerm";
  
      const options = loanOptions[optionKey] || [];
  
      // Select the appropriate loan option
      let selectedOption;
      if (optionKey === "openTerm") {
        selectedOption = options.find(opt => opt.amount >= newPrincipal) || options[options.length - 1];
      } else {
        selectedOption =
          options.find(opt => opt.amount === newPrincipal) ||
          options.slice().sort((a, b) => b.amount - a.amount).find(opt => opt.amount <= newPrincipal) ||
          options[0];
      }
  
      // Use selectedOption months and interest
      const months = selectedOption?.months || Number(existingApp.appLoanTerms) || 12;
      const interestRate = selectedOption?.interest || Number(existingApp.appInterestRate) || 0;
  
      const updatedFields = computeLoanFields(Number(newPrincipal), months, interestRate);
  
      await loanApplications.updateOne({ applicationId }, { $set: updatedFields });
      const updatedApp = await loanApplications.findOne({ applicationId });
  
      res.json({ updatedApp });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update principal" });
    }
  });
  
  

  return router;
};
  
