module.exports = (db) => {
    const users = db.collection("users");
    const logs = db.collection("logs");
  
    return {
      findByEmail: (email) => users.findOne({ email: email.toLowerCase() }),
      findByUsername: (username) => users.findOne({ username }),
      findMaxUser: () =>
        users
          .aggregate([
            { $addFields: { userIdNum: { $toInt: "$userId" } } },
            { $sort: { userIdNum: -1 } },
            { $limit: 1 },
          ])
          .toArray(),
      insertUser: (user) => users.insertOne(user),
      updateProfilePic: (userId, profilePic) =>
        users.updateOne({ userId }, { $set: { profilePic } }),
      logAction: (log) => logs.insertOne(log),
    };
  };
  