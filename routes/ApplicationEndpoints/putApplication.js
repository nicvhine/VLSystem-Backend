const express = require('express');
const router = express.Router();

const authenticateToken = require('../../middleware/auth'); 
const { decrypt } = require('../../utils/crypt'); 

module.exports = (db) => {
const loanApplications = db.collection("loan_applications");

//change status
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
          console.log('[NOTIFICATION DEBUG] req.user:', JSON.stringify(req.user, null, 2));
          let actorName = req.user?.fullName || req.user?.name || req.user?.username || req.user?.email || "Unknown";
          let actorProfilePic = req.user?.profilePic || req.user?.photo || req.user?.avatar || "";
          if (actorName === "Unknown" || !actorProfilePic) {
            console.warn('[NOTIFICATION DEBUG] Fallback triggered. req.user:', JSON.stringify(req.user, null, 2));
            if (req.user) {
              Object.keys(req.user).forEach(key => {
                console.warn(`[NOTIFICATION DEBUG] req.user[${key}]:`, req.user[key]);
              });
            }
          }
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
  

return router;
}