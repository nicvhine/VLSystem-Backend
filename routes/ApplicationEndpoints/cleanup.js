require('dotenv').config();
const cron = require('node-cron');
const { MongoClient } = require('mongodb');
const loanAppRepository = require('../../Repositories/loanApplicationRepository');

const uri = process.env.MONGODB_URI; 

async function cleanupPendingApplications() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);

    const repo = loanAppRepository(db);

    // 7 days ago
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const deletedCount = await repo.deleteMany({
      status: "Applied",
      dateApplied: { $lte: sevenDaysAgo }
    });    

    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} 'Applied' applications older than 7 days.`);
    } else {
      console.log("No 'Applied' applications to delete.");
    }

  } catch (err) {
    console.error('Error cleaning up pending applications:', err);
  } finally {
    await client.close();
  }
}

// Run once daily at 2:00 AM
cron.schedule('0 2 * * *', cleanupPendingApplications);

console.log('Cleanup cron job scheduled to run daily at 2:00 AM');
