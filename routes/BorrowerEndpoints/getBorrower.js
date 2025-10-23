const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");
const { getBorrowerById } = require("../../Services/borrowerService");

module.exports = (db) => {

  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Get borrower details
      const borrowerDetails = await getBorrowerById(id, db);

      // Get latest application for this borrower
      const latestApplication = await db.collection("loan_applications")
        .find({ borrowersId: id })
        .sort({ createdAt: -1 }) 
        .limit(1)
        .toArray();

      res.json({
        borrowerDetails,
        latestApplication: latestApplication[0] || null
      });
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: error.message || "Failed to fetch borrower" });
    }
  });

  return router;
};
