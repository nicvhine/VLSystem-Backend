require('dotenv').config();
const cron = require('node-cron');
const { MongoClient } = require('mongodb');
const loanAppRepository = require('../../Repositories/loanApplicationRepository');

const uri = process.env.MONGODB_URI;

async function cleanupPendingApplications() {
  const now = new Date();
  console.log(`[${now.toLocaleString()}] Running scheduled auto-deny of stale applications...`);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "VLSystem");
    const loanRepo = loanAppRepository(db);
    console.log(`[${now.toLocaleString()}] Connected to database: ${db.databaseName}`);

    // Applications older than 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // const cutoff = new Date(Date.now() - 2 * 60 * 1000);

    console.log(`[DEBUG] Looking for 'Applied' applications older than ${cutoff.toISOString()}`);

    const oldApplications = await db
      .collection('loan_applications')
      .find({ status: 'Applied', dateApplied: { $lte: cutoff } })
      .toArray();

    if (oldApplications.length === 0) {
      console.log(`[${now.toLocaleString()}] No stale 'Applied' applications found.`);
      return;
    }

    // Update their status to "Denied"
    const updateResult = await db.collection('loan_applications').updateMany(
      { status: 'Applied', dateApplied: { $lte: cutoff } },
      {
        $set: {
          status: 'Denied',
          denialReason: 'Automatically denied due to 7 days of inactivity',
          dateDenied: new Date(),
        },
      }
    );

    console.log(
      `[${now.toLocaleString()}] Marked ${updateResult.modifiedCount} 'Applied' loan applications as 'Denied'.`
    );

    // Create notifications for each affected application
    for (const app of oldApplications) {
      const notification = {
        userId: app.createdBy || "system",
        actor: {
          id: "system",
          name: "System",
          username: "system",
        },
        message: `Loan application ${app.applicationId} was automatically denied after 7 days of inactivity.`,
        read: false,
        viewed: false,
        createdAt: new Date(),
        notifyAt: new Date(),
      };

      await db.collection('loanOfficer_notifications').insertOne(notification);
      console.log(`[${now.toLocaleString()}] Notification sent to ${app.createdBy || "system"}.`);
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleString()}] Error in cleanupPendingApplications:`, err);
  } finally {
    await client.close();
    console.log(`[${new Date().toLocaleString()}] Database connection closed.`);
  }
}

// Run daily at midnight 
cron.schedule('0 0 * * *', cleanupPendingApplications);
// cron.schedule('*/1 * * * *', cleanupPendingApplications); // runs every minute


console.log('Auto-deny cron job scheduled to run daily at 00:00 (production mode: marks "Applied" older than 7 days as Denied).');
