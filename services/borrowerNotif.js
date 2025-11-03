const notificationRepository = require("../Repositories/notificationRepository");
const { addDays, format } = require("date-fns"); 

async function getBorrowerNotifications(db) {
  const repo = notificationRepository(db);
  const notifs = await repo.getBorrowerNotifications();
  return await enrichWithActorProfilePic(db, notifs);
}

// Generic role-based operations
async function markNotificationRead(db, role, id, borrowersId) {
  const repo = notificationRepository(db);
  if (role === "loan-officer") {
    return await repo.markLoanOfficerNotificationRead(id);
  } else if (role === "manager") {
    return await repo.markManagerNotificationRead(id);
  } else if (role === "borrower") {
    if (!borrowersId) throw new Error("Missing borrowersId");
    return await repo.markBorrowerNotificationRead(id, borrowersId);
  }
  throw new Error("Invalid role");
}

async function markAllRoleRead(db, role, borrowersId) {
  const repo = notificationRepository(db);
  if (role === "loan-officer") {
    return await repo.markAllLoanOfficerNotificationsRead();
  } else if (role === "manager") {
    return await repo.markAllManagerNotificationsRead();
  } else if (role === "borrower") {
    if (!borrowersId) throw new Error("Missing borrowersId");
    return await repo.markAllBorrowerNotificationsRead(borrowersId);
  }
  throw new Error("Invalid role");
}

async function scheduleDueNotifications(db, collections) {
  if (!collections || collections.length === 0) return;

  const notificationsCollection = db.collection("borrower_notifications");
  const notifications = [];

  collections.forEach((col) => {
    const daysBefore = [3, 2, 1, 0]; 
    daysBefore.forEach((days) => {
      const notifyDate = addDays(col.dueDate, -days);
      const dayLabel = days === 0 ? "Today" : `${days} day(s) before`;

      notifications.push({
        borrowersId: col.borrowersId,
        loanId: col.loanId,
        collectionRef: col.referenceNumber,
        message: `Your payment for collection ${col.referenceNumber} is due on ${format(col.dueDate, "yyyy-MM-dd")} (${dayLabel}).`,
        read: false,
        viewed: false,
        createdAt: new Date(),
        notifyAt: notifyDate,
      });
    });
  });

  if (notifications.length > 0) {
    await notificationsCollection.insertMany(notifications);
  }
}

async function addBorrowerPaymentNotification(db, borrowersId, referenceNumber, amount, method) {
  const notificationsCollection = db.collection("borrower_notifications");

  const message = `Your payment of ₱${amount.toLocaleString()} via ${method} for collection ${referenceNumber} has been recorded.`;

  const notification = {
    borrowersId,
    collectionRef: referenceNumber,
    message,
    read: false,
    viewed: false,
    createdAt: new Date(),
    notifyAt: new Date(),
  };

  await notificationsCollection.insertOne(notification);
  console.log(`Borrower notification sent: ${message}`);
}


module.exports = {
  getBorrowerNotifications,
  markNotificationRead,
  markAllRoleRead,
  scheduleDueNotifications,
  addBorrowerPaymentNotification,
};
