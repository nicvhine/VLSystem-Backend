const express = require('express');
const router = express.Router();

module.exports = (db) => {
  const loans = db.collection('loans');

  router.get("/loan-stats", async (req, res) => {
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
  
  router.get("/loan-type-stats", async (req, res) => {
    try {
      const collection = db.collection("loans");
  
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

  router.get("/applicationStatus-stats", async (req, res) => {
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
   router.get("/collection-stats", async (req, res) => {
    try {
      const result = await db.collection("collections").aggregate([
        { $group: { _id: null, totalCollectables: {  $sum: "$periodAmount" }, totalCollected: { $sum: "$paidAmount" }, totalPenalty: { $sum: "$penalty" } } }
      ]).toArray();

      const totalCollectables = result[0]?.totalCollectables || 0;
      const totalCollected = result[0]?.totalCollected || 0;
      const totalPenalty = result[0]?.totalPenalty || 0;
      const totalUnpaid = totalCollectables + totalPenalty - totalCollected;

      res.json({ totalCollectables, totalCollected, totalUnpaid, totalPenalty });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch collection stats" });
    }
  });

  router.get("/applied-loan-type-stats", async (req, res) => {
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
