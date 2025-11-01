const express = require('express');
const router = express.Router();
const ClosureService = require("../../Services/closureService");

module.exports = (db) => {
  const service = ClosureService(db);

  router.put('/:endorsementId', async (req, res) => {
    const { endorsementId } = req.params;
    const { status } = req.body;

    if (!status || !["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const closure = await service.getClosureById(endorsementId);
      if (!closure) return res.status(404).json({ message: "Closure not found" });

      // Update closure endorsement
      await db.collection("closure_endorsements").updateOne(
        { endorsementId },
        { $set: { status, updatedAt: new Date() } }
      );

      if (status === "Approved") {
        const loanId = closure.loanId?.trim();
        if (!loanId) {
          return res.status(400).json({ message: "LoanId not found in closure" });
        }

        // Fetch the loan
        const loan = await db.collection("loans").findOne({ loanId });
        if (!loan) {
          return res.status(404).json({ message: "Loan not found" });
        }

        // Update the loan
        await db.collection("loans").updateOne(
          { loanId },
          { $set: { status: "Closed", dateClosed: new Date() } }
        );
        console.log("Loan updated:", loanId);

        // Update loan application(s)
        if (loan.applicationId) {
          const loanAppUpdate = await db.collection("loan_applications").updateOne(
            { applicationId: loan.applicationId },
            { $set: { status: "Closed", dateClosed: new Date() } }
          );
          console.log(`Loan application updated: ${loanAppUpdate.modifiedCount}`);
        } else {
          console.log(`Loan ${loanId} has no applicationId, skipping loan_applications update.`);
        }

        // Update collections
        const collectionsUpdate = await db.collection("collections").updateMany(
          { loanId },
          { $set: { status: "Closed" } }
        );
        console.log(`Collections updated: ${collectionsUpdate.modifiedCount}`);
      }

      return res.status(200).json({ message: "Status updated successfully" });
    } catch (err) {
      console.error("Closure update error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
