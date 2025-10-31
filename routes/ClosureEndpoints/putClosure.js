const express = require('express');
const router = express.Router();
const ClosureService = require("../../Services/closureService");

module.exports = (db) => {
  const service = ClosureService(db);

  router.put('/:endorsementId', async (req, res) => {
    const { endorsementId } = req.params;
    console.log("PUT closure called for endorsementId:", endorsementId);

    const { status } = req.body;

    if (!status || !["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      // Fetch closure endorsement
      const closure = await service.getClosureById(endorsementId);
      if (!closure) return res.status(404).json({ message: "Closure not found" });

      // Update closure endorsement status
      await db.collection("closure_endorsements").updateOne(
        { endorsementId },
        { $set: { status, updatedAt: new Date() } }
      );

      if (status === "Approved") {
        // Update loan status to "Closed"
        const loanUpdateResult = await db.collection("loans").findOneAndUpdate(
          { loanId: closure.loanId },
          { $set: { status: "Closed", dateClosed: new Date() } },
          { returnDocument: "after" }
        );

        if (!loanUpdateResult.value) {
          return res.status(404).json({ message: "Loan not found" });
        }

        // Get applicationId from the updated loan
        const applicationId = loanUpdateResult.value.applicationId;

        if (applicationId) {
          // Update loan_applications status to "Closed"
          await db.collection("loan_applications").updateOne(
            { applicationId },
            { $set: { status: "Closed", dateClosed: new Date() } }
          );
        }
      }

      return res.status(200).json({ message: "Status updated successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
