import dotenv from 'dotenv';
import cron from 'node-cron';
import { MongoClient } from 'mongodb';
import { sendSMS } from '../../services/smsService.js';

dotenv.config({ path: '../../.env' });

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

// --- STATUS UPDATE (TEST) ---
async function updateCollectionStatusesTest() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collectionsCol = db.collection('collections');
    const now = new Date();
    let updatedCount = 0;

    const collections = await collectionsCol.find({}).toArray();

    for (const col of collections) {
      const { dueDate, referenceNumber, status } = col;
      if (!dueDate || status === 'Paid') continue;

      const due = new Date(dueDate);
      const daysLate = Math.floor((now - due) / (1000 * 60)); // minutes for test
      let newStatus = status;

      if (status === 'Unpaid' && daysLate > 1) newStatus = 'Past Due'; // quick test
      if (newStatus !== status) {
        await collectionsCol.updateOne({ referenceNumber }, { $set: { status: newStatus, lastStatusUpdated: now } });
        updatedCount++;
        console.log(`[TEST] Collection ${referenceNumber} status updated to "${newStatus}"`);
      }
    }

    console.log(`[TEST] Updated ${updatedCount} collection(s) at ${now.toLocaleTimeString()}`);
  } catch (err) {
    console.error('[TEST] Error during status update:', err);
  } finally {
    await client.close();
  }
}

// --- SMS REMINDERS (TEST) ---
async function sendDailySMSRemindersTest() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collectionsCol = db.collection('collections');
    const borrowersCol = db.collection('borrowers_account');
    const now = new Date();
    let smsCount = 0;

    const collections = await collectionsCol.find({ status: { $in: ['Past Due', 'Overdue'] } }).toArray();

    for (const col of collections) {
      const { status, borrowersId, referenceNumber, lastSMSSent } = col;

      const lastSent = lastSMSSent ? new Date(lastSMSSent) : null;
      const sentToday =
        lastSent &&
        now.getTime() - lastSent.getTime() < 30 * 1000; // 30 sec window for testing
      if (sentToday) continue;

      const borrower = await borrowersCol.findOne({ borrowersId });
      if (borrower && borrower.phoneNumber) {
        const { phoneNumber, name } = borrower;
        const message =
          status === 'Past Due'
            ? `[TEST] Hello${name ? ' ' + name : ''}, your payment is PAST DUE.`
            : `[TEST] Hello${name ? ' ' + name : ''}, your account is OVERDUE.`;

        try {
          await sendSMS(phoneNumber, message);
          smsCount++;
          await collectionsCol.updateOne({ referenceNumber }, { $set: { lastSMSSent: now } });
          console.log(`[TEST] Sent ${status} SMS to ${name || 'Unknown'} (${phoneNumber})`);
        } catch (smsErr) {
          console.error(`[TEST] Failed SMS to ${phoneNumber}:`, smsErr.message);
        }
      }
    }

    console.log(`[TEST] Sent ${smsCount} SMS reminder(s) at ${now.toLocaleTimeString()}`);
  } catch (err) {
    console.error('[TEST] Error during SMS reminders:', err);
  } finally {
    await client.close();
  }
}

// --- TEST CRON ---
cron.schedule('*/1 * * * *', updateCollectionStatusesTest); // every minute
cron.schedule('*/30 * * * * *', sendDailySMSRemindersTest); // every 30 sec
console.log('✅ TEST cron jobs scheduled: status updater (1 min) & SMS reminders (30 sec)');
