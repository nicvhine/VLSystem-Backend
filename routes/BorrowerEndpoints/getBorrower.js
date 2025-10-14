const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/auth");

const borrowerRepository = require("../../repositories/borrowerRepository");
const { getBorrowerById } = require("../../Services/borrowerService");

module.exports = (db) => {
  const repo = borrowerRepository(db);

  router.get("/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const borrowerDetails = await getBorrowerById(id, repo);
      res.json({ borrowerDetails });
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: error.message || "Failed to fetch borrower" });
    }
  });

  return router;
};
