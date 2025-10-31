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

    await db.collection("closure_endorsements").updateOne(
      { endorsementId },
      { $set: { status, updatedAt: new Date() } }
    );

    if (status === "Approved") {
      await db.collection("loans").updateOne(
        { loanId: closure.loanId },
        { $set: { status: "Closed", dateClosed: new Date() } }
      );
    }

    return res.status(200).json({ message: "Status updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

return router;

};


