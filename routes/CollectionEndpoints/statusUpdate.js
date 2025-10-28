require('dotenv').config();
const cron = require('node-cron');
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI; 
const dbName = process.env.DB_NAME;

async function updateCollectionStatuses() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collections = await db.collection('collections').find({}).toArray();
    const now = new Date();

    let updatedCount = 0;

    for (const collection of collections) {
      const { dueDate, isPaid } = collection;
      if (!dueDate) continue;

      const due = new Date(dueDate);
      const daysLate = Math.floor((now - due) / (1000 * 60 * 60 * 24));

      let newStatus = collection.status || 'Unpaid';

      // --- Status rules ---
      if (!isPaid) {
        if (daysLate > 30) newStatus = 'Overdue';
        else if (daysLate > 3) newStatus = 'Past Due';
        else newStatus = 'Unpaid';
      } else {
        if (daysLate > 3) newStatus = 'Late';
        else newStatus = 'Paid';
      }

      if (newStatus !== collection.status) {
        await db.collection('collections').updateOne(
          { _id: new ObjectId(collection._id) },
          { $set: { status: newStatus, lastStatusUpdated: new Date() } }
        );
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`Updated ${updatedCount} collection(s) at ${now.toLocaleTimeString()}`);
    } else {
      console.log(`No status changes detected at ${now.toLocaleTimeString()}`);
    }

  } catch (err) {
    console.error('Error during automatic status update:', err);
  } finally {
    await client.close();
  }
}

// Run every 10 seconds (for testing)
cron.schedule('*/10 * * * * *', updateCollectionStatuses);

console.log('Auto Collection Status Updater scheduled (every 10 seconds)');
