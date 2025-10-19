const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");

const loanAppRepository = require("../../Repositories/loanApplicationRepository");
const loanAppService = require("../../Services/loanApplicationService");

module.exports = (db) => {
  const repo = loanAppRepository(db);

  // GET all applications
  router.get("/", async (req, res) => {
    try {
      const apps = await loanAppService.getAllApplications(repo);
      res.status(200).json(apps);
    } catch (error) {
      console.error("Error in GET /loan-applications:", error);
      res.status(500).json({ error: "Failed to fetch loan applications." });
    }
  });

  // GET interviews
  router.get("/interviews", authenticateToken, async (req, res) => {
    try {
      const interviews = await loanAppService.getInterviewList(repo);
      res.status(200).json(interviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews." });
    }
  });

  // GET application status stats
  router.get("/applicationStatus-stats", async (req, res) => {
    try {
      const stats = await loanAppService.getStatusStats(repo);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching loan stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics." });
    }
  });

  // GET loan type stats
  router.get("/loan-type-stats", async (req, res) => {
    try {
      const stats = await loanAppService.getLoanTypeStats(repo);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching loan type stats:", error);
      res.status(500).json({ error: "Failed to fetch loan type statistics." });
    }
  });

  // GET application by ID
  router.get("/:applicationId", async (req, res) => {
    try {
      const { applicationId } = req.params;
      const application = await loanAppService.getApplicationById(repo, applicationId);
  
      if (!application) {
        return res.status(404).json({ error: "Application not found." });
      }
  
      res.status(200).json(application);
    } catch (error) {
      console.error("Error fetching loan application by ID:", error);
      res.status(500).json({ error: "Failed to fetch loan application." });
    }
  });
  return router;
};
