const express = require('express');
const router = express.Router();

const authenticateToken = require('../../middleware/auth');
const { decrypt } = require('../../utils/crypt'); 

module.exports = (db) => {
const loanApplications = db.collection("loan_applications");

//get all applications
  router.get("/", async (req, res) => {
    try {
      const applications = await loanApplications.find().toArray();
  
      const decryptedApps = applications.map(app => ({
        ...app,
        appName: decrypt(app.appName),
        appContact: decrypt(app.appContact),
        appEmail: decrypt(app.appEmail),
        appSpouseName: decrypt(app.appSpouseName),
        appAddress: decrypt(app.appAddress),
        appReferences: app.appReferences?.map(r => ({
          name: decrypt(r.name),
          contact: decrypt(r.contact),
          relation: r.relation
        })),
      }));
  
      res.status(200).json(decryptedApps);
    } catch (error) {
      console.error("Error in GET /loan-applications:", error);
      res.status(500).json({ error: "Failed to fetch loan applications." });
    }
  });

//get interview list
router.get("/interviews", authenticateToken, async (req, res) => {
    try {
      const interviews = await db.collection("loan_applications")
        .find({ interviewDate: { $exists: true } })
        .project({ applicationId: 1, appName: 1, interviewDate: 1, interviewTime: 1, status: 1, appAddress: 1, _id: 0 })
        .toArray();
  
      const decryptedInterviews = interviews.map(i => ({
        ...i,
        appName: i.appName ? decrypt(i.appName) : "",
        appAddress: i.appAddress ? decrypt(i.appAddress) : ""
      }));
  
      res.status(200).json(decryptedInterviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

 //fetch status stats
 router.get("/applicationStatus-stats", async (req, res) => {
  try {
    const collection = db.collection("loan_applications");

    const applied = await collection.countDocuments({ status: { $regex: /^applied$/i } });
    const approved = await collection.countDocuments({ status: { $regex: /^approved$/i } });
    const denied = await collection.countDocuments({ status: { $regex: /^denied$/i } });


    res.json({
      approved,
      denied,
      applied
    });
  } catch (error) {
    console.error("Error fetching loan stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

//fetch stats for loan type
router.get("/loan-type-stats", async (req, res) => {
  try {
    const collection = db.collection("loan_applications");

    const types = await collection.aggregate([
      {
        $group: {
          _id: "$loanType",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          loanType: "$_id",
          count: 1
        }
      }
    ]).toArray();

    res.status(200).json(types);
  } catch (error) {
    console.error("Error fetching loan type stats:", error);
    res.status(500).json({ error: "Failed to fetch loan type statistics" });
  }
});

    return router;
}