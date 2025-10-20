const notificationRepository = require("../Repositories/notificationRepository");

async function getLoanOfficerNotifications(db) {
  const repo = notificationRepository(db);
  return await repo.getLoanOfficerNotifications();
}

async function markLoanOfficerNotificationRead(db, id) {
  const repo = notificationRepository(db);
  return await repo.markLoanOfficerNotificationRead(id);
}

async function markAllLoanOfficerNotificationsRead(db) {
  const repo = notificationRepository(db);
  return await repo.markAllLoanOfficerNotificationsRead();
}

async function getManagerNotifications(db) {
  const repo = notificationRepository(db);
  return await repo.getManagerNotifications();
}

async function markManagerNotificationRead(db, id) {
  const repo = notificationRepository(db);
  return await repo.markManagerNotificationRead(id);
}

async function markAllManagerNotificationsRead(db) {
  const repo = notificationRepository(db);
  return await repo.markAllManagerNotificationsRead();
}

async function getBorrowerNotifications(db, borrowersId) {
  const repo = notificationRepository(db);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  const dueCollections = await repo.findDueCollections(
    borrowersId,
    today,
    threeDaysLater
  );

  const existingRefs = await repo.findExistingDueRefs(borrowersId);

  const newDueNotifs = dueCollections
    .filter((c) => !existingRefs.includes(c.referenceNumber))
    .map((c) => {
      const dueDate = new Date(c.dueDate);
      const diffTime = dueDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        id: `due-${c.referenceNumber}`,
        message: `📅 Payment due in ${daysRemaining} day${
          daysRemaining !== 1 ? "s" : ""
        } for Collection ${c.collectionNumber}`,
        referenceNumber: c.referenceNumber,
        borrowersId: c.borrowersId,
        date: c.dueDate,
        read: false,
        type: "due",
        createdAt: new Date(),
      };
    });

  if (newDueNotifs.length > 0) {
    await repo.insertBorrowerNotifications(newDueNotifs);
  }

  return await repo.getBorrowerNotifications(borrowersId);
}

module.exports = {
  getLoanOfficerNotifications,
  markLoanOfficerNotificationRead,
  markAllLoanOfficerNotificationsRead,
  getManagerNotifications,
  markManagerNotificationRead,
  markAllManagerNotificationsRead,
  getBorrowerNotifications,
};
