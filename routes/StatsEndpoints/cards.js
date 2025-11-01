const express = require('express');
const authenticateToken = require('../../Middleware/auth');
const authorizeRole = require('../../Middleware/authorizeRole');
const router = express.Router();

module.exports = (db) => {
  const loans = db.collection('loans');

  router.get("/loan-stats", authenticateToken, authorizeRole("head", "loan officer", "manager"), async (req, res) => {
    try {
      const result = await db.collection("loan_applications").aggregate([
        {
          $match: {
            status: { $in: ["Active", "Closed"] }
          }
        },
        {
          $group: {
            _id: null,
            totalPrincipal: { $sum: { $toDouble: "$appLoanAmount" } },
            totalInterest: { $sum: { $toDouble: "$appInterestAmount" } }
          }
        }
      ]).toArray();
  
      res.json({
        totalPrincipal: result[0]?.totalPrincipal || 0,
        totalInterest: result[0]?.totalInterest || 0,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch loan stats" });
    }
  });
  
  router.get("/loan-type-stats", authenticateToken, authorizeRole("manager", "head"), async (req, res) => {
    try {
      const loansCollection = db.collection("loans");
  
      const types = await loansCollection.aggregate([
        // Join with loan_applications on applicationId
        {
          $lookup: {
            from: "loan_applications",
            localField: "applicationId",
            foreignField: "applicationId",
            as: "application",
          },
        },
        // Flatten the joined array
        { $unwind: "$application" },
        // Group by loanType from the joined application
        {
          $group: {
            _id: "$application.loanType",
            count: { $sum: 1 },
          },
        },
        // Format output
        {
          $project: {
            _id: 0,
            loanType: "$_id",
            count: 1,
          },
        },
      ]).toArray();
  
      res.status(200).json(types);
    } catch (error) {
      console.error("Error fetching loan type stats:", error);
      res.status(500).json({ error: "Failed to fetch loan type statistics" });
    }
  });
  
  router.get("/applicationStatus-stats", authenticateToken, authorizeRole("manager", "head", "loan officer"), async (req, res) => {
    try {
      const collection = db.collection("loan_applications");
  
      const applied = await collection.countDocuments({ status: { $regex: /^applied$/i } });
  
      // Consider Disbursed, Active, Closed as Approved
      const approved = await collection.countDocuments({ status: { $in: ["Disbursed", "Active", "Closed", "Approved"] } });
  
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
  

   // GET collection stats
   router.get(
    "/collection-stats",
    authenticateToken,
    authorizeRole("manager", "head", "collector"),
    async (req, res) => {
      try {
        const { role, username } = req.user;
  
        const matchStage = role === "collector" ? { $match: { collector: username } } : { $match: {} };
  
        const result = await db
          .collection("collections")
          .aggregate([
            matchStage,
            {
              $group: {
                _id: null,
                totalCollectables: { $sum: "$periodAmount" },
                totalCollected: { $sum: "$paidAmount" },
                totalPenalty: { $sum: "$penalty" },
              },
            },
          ])
          .toArray();
  
        const totalCollectables = result[0]?.totalCollectables || 0;
        const totalCollected = result[0]?.totalCollected || 0;
        const totalPenalty = result[0]?.totalPenalty || 0;
        const totalUnpaid = totalCollectables + totalPenalty - totalCollected;
  
        res.json({ totalCollectables, totalCollected, totalUnpaid, totalPenalty });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch collection stats" });
      }
    }
  );  

  router.get("/applied-loan-type-stats", authenticateToken, authorizeRole("manager", "head", "loan officer"), async (req, res) => {
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
};
