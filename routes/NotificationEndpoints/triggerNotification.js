const cron = require("node-cron");

const checkNotifications = async (db) => {
  const now = new Date();

  const notificationsCollection = db.collection("borrower_notifications");

  // Find notifications whose notifyAt is today or in the past and not yet viewed/read
  const dueNotifications = await notificationsCollection
    .find({ notifyAt: { $lte: now }, read: false })
    .toArray();

  for (const notif of dueNotifications) {
    console.log(`Triggering notification for borrower ${notif.borrowersId}: ${notif.message}`);

    await notificationsCollection.updateOne(
      { _id: notif._id },
      { $set: { viewed: true } }
    );
  }
};

// Run cron job every day at 8:00 AM
const startNotificationCron = (db) => {
    cron.schedule("*/20 * * * * *", async () => {
      console.log("Running notification check every 20 seconds...");
      await checkNotifications(db);
    });
  };
  

module.exports = { startNotificationCron };
