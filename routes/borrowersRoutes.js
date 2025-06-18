const express = require('express');
const router = express.Router();

function generateUsername(fullName) {
  const parts = fullName.trim().toLowerCase().split(" ");
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return firstName.slice(0, 3) + lastName;
}

function padId(num) {
  return num.toString().padStart(5, '0');
}

module.exports = (db, getNextSequence) => {
  const borrowers = db.collection("borrowers_account");

  router.post("/", async (req, res) => {
    try {
      const { name, role } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: "Name and role are required" });
      }

      if (!name.trim().includes(" ")) {
        return res.status(400).json({ error: "Please provide full name (first and last)" });
      }

      const username = generateUsername(name);
      if (!username) {
        return res.status(400).json({ error: "Invalid full name" });
      }

      const borrowerIdNum = await getNextSequence(db, 'borrowersId');
      const borrowersId = padId(borrowerIdNum);
      const defaultPassword = "123456";

      const borrower = {
        borrowersId,
        name,
        role,
        username,
        password: defaultPassword,
      };

      await borrowers.insertOne(borrower);

      res.status(201).json({ message: "Borrower created", borrower: { borrowersId, name, role, username } });
    } catch (error) {
      console.error("Error adding borrower:", error);
      res.status(500).json({ error: "Failed to add borrower" });
    }
  });

  return router;
};
