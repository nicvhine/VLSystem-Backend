const express = require("express");
const router = express.Router();
const { upload, validate2x2, processUploadedDocs } = require("../../Utils/uploadConfig");
const { createLoanApplication } = require("../../Services/loanApplicationService");
const loanApplicationRepository = require("../../Repositories/loanApplicationRepository");

// Submit a new loan application with file uploads
module.exports = (db) => {
  const repo = loanApplicationRepository(db);

  router.post(
    "/apply/:loanType",
    upload.fields([
      { name: "documents", maxCount: 6 },
      { name: "profilePic", maxCount: 1 }
    ]),
    validate2x2,
    async (req, res) => {
      try {
        const { loanType } = req.params;
        const uploadedFiles = await processUploadedDocs(req.files);
  
        const application = await createLoanApplication(req, loanType, repo, db, uploadedFiles);
  
        res.status(201).json({
          message: "Loan application submitted successfully.",
          application,
        });
      } catch (error) {
        console.error("Error in /loan-applications/apply/:loanType:", error);
        res.status(400).json({ error: error.message || "Failed to submit loan application." });
      }
    }
  );
  

  return router;
};
