const express = require("express");
const router = express.Router();
const { upload, validate2x2, processUploadedDocs } = require("../../utils/uploadConfig");
const { createLoanApplication } = require("../../Services/loanApplicationService");
const loanApplicationRepository = require("../../repositories/loanApplicationRepository");

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
        const uploadedFiles = await processUploadedDocs(req.files);
        const { loanType } = req.params;

        // pass uploadedFiles to your service
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
