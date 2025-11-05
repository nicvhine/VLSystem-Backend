const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth'); 
const authorizeRole = require('../../Middleware/authorizeRole');
const { computeLoanFields } = require('../../Services/loanApplicationService');
const LogRepository = require('../../repositories/logRepository');
const { sendSMS, formatPhoneNumber } = require('../../Services/smsService');
const { decrypt } = require("../../Utils/crypt");

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
  const logRepo = LogRepository(db);

  router.put("/:applicationId", authenticateToken, authorizeRole("manager", "loan officer"), async (req, res) => {
    try {
      const { applicationId } = req.params;
      const updateData = req.body;

      // Add disbursed date if status is "Disbursed"
      if (typeof updateData.status === "string" && updateData.status.trim().toLowerCase() === "disbursed") {
        updateData.dateDisbursed = new Date();
      }

      const agents = db.collection("agents");
      const existingApp = await loanApplications.findOne({ applicationId });
      if (!existingApp) return res.status(404).json({ error: "Loan application not found." });

      await loanApplications.updateOne({ applicationId }, { $set: updateData });
      const updatedDoc = await loanApplications.findOne({ applicationId });

      await logRepo.insertActivityLog({
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        action: "UPDATE_LOAN_APPLICATION",
        description: `Updated loan application ${applicationId}: ${JSON.stringify(updateData)}`,
      });

      res.status(200).json({
        ...updatedDoc,
        _debug: { statusUpdated: true },
      });

      // Async post-update: update agent stats & notify
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

              console.log(`[AGENT UPDATE] Updated agent ${agentId}`);
            }
          }

          // If status changed to "Approved", send SMS notification to borrower
          if (typeof updateData.status === "string" && updateData.status.trim().toLowerCase() === "approved") {
            try {
              let phone = existingApp.appContact;

              if (phone && typeof phone === "string") {
                phone = decrypt(phone);
              }
          
              console.log("[DEBUG] Decrypted borrower phone:", phone);

              if (phone) {
                const formattedPhone = formatPhoneNumber(phone);
                const message = `Your loan application ${applicationId} has been approved! Please stay alert for calls or updates regarding the disbursement process.`;

                await sendSMS(formattedPhone, message, "Gethsemane");
                console.log(`📩 Loan approval SMS sent to ${formattedPhone}`);
              } else {
                console.warn(`[SMS SKIPPED] No phone number found for borrower of application ${applicationId}`);
              }
            } catch (smsErr) {
              console.error(`[SMS ERROR] Failed to send approval SMS:`, smsErr.message);
            }
          }

          // Notification system between manager and loan officer
          function normalizeRole(role) {
            return String(role || "").trim().toLowerCase().replace(/[_-]+/g, " ");
          }

          const actorRole = normalizeRole(req.user?.role || "");
          const prevStatus = String(existingApp.status || "");
          const nextStatus = String(updatedDoc.status || updateData.status || "");
          const changed = nextStatus.trim().toLowerCase() !== prevStatus.trim().toLowerCase();

          const roleToCollection = {
            manager: "loanOfficer_notifications",
            "loan officer": "manager_notifications",
          };

          const targetCollectionName = roleToCollection[actorRole];

          if (changed && targetCollectionName) {
            const actorName = req.user?.name || req.user?.username || "Unknown";

            const message =
              actorRole === "manager"
                ? `${actorName} (Manager) has changed application ${applicationId} to "${nextStatus}"`
                : `${actorName} (Loan Officer) has changed application ${applicationId} to "${nextStatus}"`;

            await db.collection(targetCollectionName).insertOne({
              applicationId,
              message,
              status: nextStatus,
              createdAt: new Date(),
              read: false,
              actorRole,
              actorName,
              previousStatus: prevStatus,
            });

            console.log("[NOTIFICATION DEBUG] Sent:", message);
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


  router.put("/:applicationId/schedule-interview", authenticateToken, authorizeRole("loan officer"), async (req, res) => {
    const { applicationId } = req.params;
    const { interviewDate, interviewTime } = req.body;
  
    if (!interviewDate || !interviewTime) {
      return res.status(400).json({ error: "Date and time are required" });
    }
  
    try {
      const result = await loanApplications.updateOne(
        { applicationId },
        { $set: { interviewDate, interviewTime, status: "Pending" } }
      );
  
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Application not found" });
      }
  
      await logRepo.insertActivityLog({
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        action: "SCHEDULE_INTERVIEW",
        description: `Scheduled interview for loan application ${applicationId} on ${interviewDate} at ${interviewTime}`,
      });
  
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
  
      let optionKey = "";
      if (existingApp.loanType?.includes("With Collateral")) optionKey = "withCollateral";
      else if (existingApp.loanType?.includes("Without Collateral")) optionKey = "withoutCollateral";
      else optionKey = "openTerm";
  
      const options = loanOptions[optionKey] || [];
      let selectedOption;
      if (optionKey === "openTerm") {
        selectedOption = options.find(opt => opt.amount >= newPrincipal) || options[options.length - 1];
      } else {
        selectedOption =
          options.find(opt => opt.amount === newPrincipal) ||
          options.slice().sort((a, b) => b.amount - a.amount).find(opt => opt.amount <= newPrincipal) ||
          options[0];
      }
  
      const months = selectedOption?.months || Number(existingApp.appLoanTerms) || 12;
      const interestRate = selectedOption?.interest || Number(existingApp.appInterestRate) || 0;
      const updatedFields = computeLoanFields(Number(newPrincipal), months, interestRate);
  
      await loanApplications.updateOne({ applicationId }, { $set: updatedFields });
      const updatedApp = await loanApplications.findOne({ applicationId });
  
      await logRepo.insertActivityLog({
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        action: "UPDATE_PRINCIPAL",
        description: `Updated principal for loan application ${applicationId} to ${newPrincipal}`,
      });
      
      res.json({ updatedApp });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update principal" });
    }
  });

  return router;
};
