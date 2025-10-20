module.exports = (db) => {
    const loanOfficerNotifications = db.collection("loanOfficer_notifications");
    const managerNotifications = db.collection("manager_notifications");
    const borrowerNotifications = db.collection("notifications");
    const collections = db.collection("collections");
  
    return {
      // Loan Officer queries
      getLoanOfficerNotifications: () =>
        loanOfficerNotifications.find({}).sort({ createdAt: -1 }).limit(50).toArray(),
  
      markLoanOfficerNotificationRead: (id) => {
        const filter = require("mongodb").ObjectId.isValid(id)
          ? { _id: new require("mongodb").ObjectId(id) }
          : { id };
        return loanOfficerNotifications.findOneAndUpdate(
          filter,
          { $set: { read: true } },
          { returnDocument: "after" }
        );
      },
  
      markAllLoanOfficerNotificationsRead: () =>
        loanOfficerNotifications.updateMany({ read: false }, { $set: { read: true } }),
  
      // Manager queries
      getManagerNotifications: () =>
        managerNotifications.find({}).sort({ createdAt: -1 }).limit(50).toArray(),
  
      markManagerNotificationRead: (id) => {
        const filter = require("mongodb").ObjectId.isValid(id)
          ? { _id: new require("mongodb").ObjectId(id) }
          : { id };
        return managerNotifications.findOneAndUpdate(
          filter,
          { $set: { read: true } },
          { returnDocument: "after" }
        );
      },
  
      markAllManagerNotificationsRead: () =>
        managerNotifications.updateMany({ read: false }, { $set: { read: true } }),
  
      // Borrower queries
      getBorrowerNotifications: (borrowersId) =>
        borrowerNotifications.find({ borrowersId }).sort({ date: -1 }).toArray(),
  
      insertBorrowerNotifications: (notifs) =>
        notifs.length > 0 ? borrowerNotifications.insertMany(notifs) : null,
  
      findDueCollections: (borrowersId, today, threeDaysLater) =>
        collections
          .find({
            borrowersId,
            status: "Unpaid",
            dueDate: { $gte: today, $lte: threeDaysLater },
          })
          .sort({ dueDate: 1 })
          .toArray(),
  
      findExistingDueRefs: (borrowersId) =>
        borrowerNotifications
          .find({ borrowersId, type: "due" })
          .toArray()
          .then((docs) => docs.map((n) => n.referenceNumber)),
    };
  };
  