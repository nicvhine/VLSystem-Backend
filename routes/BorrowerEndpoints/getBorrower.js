const express = require("express");
const router = express.Router();
const authenticateToken = require("../../Middleware/auth");

const { getBorrowerById } = require("../../Services/borrowerService");

// Read borrower profile by id
module.exports = (db) => {

  router.get("/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const borrowerDetails = await getBorrowerById(id, db);
      res.json({ borrowerDetails });
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: error.message || "Failed to fetch borrower" });
    }
  });

  return router;
};
