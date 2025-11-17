const cron = require("node-cron");
const notificationRepository = require("../../repositories/notificationRepository");

/**
 * Check for applications pending for 3 days without action
 * Runs daily at midnight
 */
function startPendingApplicationChecker(db) {
  // Run daily at 00:00
  cron.schedule("0 0 * * *", async () => {
    console.log("⏰ Checking for pending applications (3 days)...");
    
    try {
      const applications = db.collection("loan_applications");
      const notifRepo = notificationRepository(db);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Find applications pending for 3+ days without approval/denial
      const pendingApps = await applications
        .find({
          status: { $in: ["Pending", "For Scheduling", "Scheduled"] },
          submittedDate: { $lte: threeDaysAgo },
        })
        .toArray();

      console.log(`📋 Found ${pendingApps.length} applications pending for 3+ days`);

      for (const app of pendingApps) {
        const applicationId = app.applicationId;
        const appName = app.appName || "Unknown";
        const status = app.status || "Pending";

        // Create status-specific message
        let managerMessage = "";
        let loanOfficerMessage = "";

        switch (status.toLowerCase()) {
          case "pending":
            managerMessage = `Application ${applicationId} from ${appName} has been in "Pending" status for 3 days without review. Please evaluate and take appropriate action.`;
            loanOfficerMessage = `Application ${applicationId} from ${appName} has remained in "Pending" status for 3 days. Please review and schedule an interview or proceed with evaluation.`;
            break;
          case "for scheduling":
            managerMessage = `Application ${applicationId} from ${appName} has been marked "For Scheduling" for 3 days without an interview date being set.`;
            loanOfficerMessage = `Application ${applicationId} from ${appName} has been awaiting interview scheduling for 3 days. Please schedule an interview appointment at your earliest convenience.`;
            break;
          case "scheduled":
            managerMessage = `Application ${applicationId} from ${appName} has had an interview scheduled for 3 days without follow-up action. Please verify completion status.`;
            loanOfficerMessage = `Application ${applicationId} from ${appName} has been in "Scheduled" status for 3 days. Please confirm if the interview was completed and proceed with approval or dismissal.`;
            break;
          default:
            managerMessage = `Application ${applicationId} from ${appName} has been in "${status}" status for 3 days without resolution. Please review and take necessary action.`;
            loanOfficerMessage = `Application ${applicationId} from ${appName} requires your attention - it has been in "${status}" status for 3 days. Please complete the required processing.`;
        }

        // Check if notification already sent
        const existingNotif = await db.collection("manager_notifications").findOne({
          type: "application-pending-3days",
          applicationId,
          createdAt: { $gte: threeDaysAgo },
        });

        if (!existingNotif) {
          // Notify Manager
          await notifRepo.insertManagerNotification({
            type: "application-pending-3days",
            title: "Application Requires Attention",
            message: managerMessage,
            applicationId,
            status,
            actor: "System",
            read: false,
            viewed: false,
            createdAt: new Date(),
          });

          console.log(`✅ Manager notified about pending application: ${applicationId} (${status})`);
        }

        // Check if loan officer notification already sent
        const existingLONotif = await db.collection("loanOfficer_notifications").findOne({
          type: "application-pending-3days",
          applicationId,
          createdAt: { $gte: threeDaysAgo },
        });

        if (!existingLONotif) {
          // Notify Loan Officer
          await notifRepo.insertLoanOfficerNotification({
            type: "application-pending-3days",
            title: "Action Required: Pending Application",
            message: loanOfficerMessage,
            applicationId,
            status,
            actor: "System",
            read: false,
            viewed: false,
            createdAt: new Date(),
          });

          console.log(`✅ Loan Officer notified about pending application: ${applicationId} (${status})`);
        }
      }

      console.log("✅ Pending application check completed");
    } catch (err) {
      console.error("❌ Error checking pending applications:", err);
    }
  });

  console.log("🟢 Pending application checker scheduled (daily at midnight)");
}

module.exports = { startPendingApplicationChecker };
