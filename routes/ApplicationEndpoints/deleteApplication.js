const express = require('express');
const router = express.Router();

module.exports = (db) => {
const loanApplications = db.collection("loan_applications");

//cleanup if no sched after 7 days
router.delete("/cleanup/unscheduled", async (req, res) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
      const result = await loanApplications.deleteMany({
        interviewDate: { $exists: false },
        dateApplied: { $lte: sevenDaysAgo },
      });
  
      res.status(200).json({
        message: `Deleted ${result.deletedCount} unscheduled applications older than 7 days.`,
      });
    } catch (error) {
      console.error("Error cleaning up unscheduled applications:", error);
      res.status(500).json({ error: "Failed to clean up unscheduled applications." });
    }
  });

  return router;
}