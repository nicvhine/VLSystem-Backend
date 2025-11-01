const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');

module.exports = (db) => {
  const loans = db.collection('loans');

  // Top Borrowers
  router.get('/top-borrowers', async (req, res) => {
    try {
      const borrowers = await db.collection("borrowers_account").find({}).toArray();

      const releasedLoans = await db
        .collection("loan_applications")
        .aggregate([
          { $match: { borrowersId: { $exists: true, $ne: null }, status: { $in: ["Active", "Inactive", "Closed"] } } },
          { $group: { _id: "$borrowersId", totalLoanAmount: { $sum: { $toDouble: "$appLoanAmount" } } } },
        ])
        .toArray();

      const borrowerData = borrowers.map((b) => {
        const loanData = releasedLoans.find((r) => r._id === b.borrowersId);
        return {
          borrowersId: b.borrowersId,
          name: b.name,
          email: b.email,
          phoneNumber: b.phoneNumber,
          totalBorrowedAmount: loanData ? loanData.totalLoanAmount : 0,
        };
      });

      const topBorrowers = borrowerData.sort((a, b) => b.totalBorrowedAmount - a.totalBorrowedAmount).slice(0, 5);

      res.json({ totalBorrowers: borrowers.length, topBorrowers });
    } catch (error) {
      console.error("Error fetching borrower overview:", error);
      res.status(500).json({ error: error.message || "Failed to fetch borrower overview" });
    }
  });

  // Top Collectors
  router.get("/top-collectors", async (req, res) => {
    try {
      // Get all collectors
      const collectors = await db.collection("users").find({ role: "collector" }).toArray();
  
      const collectorStats = await Promise.all(
        collectors.map(async (c) => {
          // All collections assigned to this collector
          const collections = await db.collection("collections").find({ collectorId: c.userId }).toArray();
  
          // Total amount they are responsible for
          const totalAssigned = collections.reduce((sum, col) => sum + (col.periodAmount || 0), 0);
  
          // Total actually collected by the collector 
          const collectedByCollector = collections
            .filter(col => col.mode === "Cash" || col.mode === "POS")
            .reduce((sum, col) => sum + (col.paidAmount || 0), 0);
  
          // Total collected regardless of mode (Cash + GCash + Bank)
          const totalCollectedIncludingOthers = collections.reduce((sum, col) => sum + (col.paidAmount || 0), 0);
  
          // Progress percentages
          const progressByCollector = totalAssigned ? (collectedByCollector / totalAssigned) * 100 : 0;
          const overallProgress = totalAssigned ? (totalCollectedIncludingOthers / totalAssigned) * 100 : 0;
  
          return {
            collectorId: c.userId,
            name: c.name,
            totalAssigned,
            collectedByCollector,
            totalCollectedIncludingOthers,
            progressByCollector: progressByCollector.toFixed(2),
            overallProgress: overallProgress.toFixed(2),
          };
        })
      );
  
      // Sort by collector performance (actual cash collected)
      collectorStats.sort((a, b) => b.collectedByCollector - a.collectedByCollector);
  
      // Return top 5
      res.json(collectorStats.slice(0, 5));
    } catch (err) {
      console.error("Error fetching top collectors:", err);
      res.status(500).json({ message: "Failed to fetch top collectors" });
    }
  });
  

// Top Agents
router.get("/top-agents", async (req, res) => {
  try {
    // Get all agents as an array
    const agents = await db.collection("agents").find({}).toArray();

    // Map to include only relevant fields
    const agentStats = agents.map(a => ({
      agentId: a._id.toString(),
      name: a.name,
      totalProcessedLoans: a.totalLoanAmount,
    }));

    // Sort by totalLoanAmount descending and take top 5
    agentStats.sort((a, b) => b.totalProcessedLoans - a.totalProcessedLoans);
    const topAgents = agentStats.slice(0, 5);

    res.json(topAgents);
  } catch (err) {
    console.error("Error fetching top agents:", err);
    res.status(500).json({ message: "Failed to fetch top agents" });
  }
});



  return router;
};
