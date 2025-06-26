const express = require('express');
const router = express.Router();
const { generateToken, authenticateToken } = require('../auth');
const bcrypt = require('bcrypt'); // Add this at the top

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

module.exports = (db) => {
  const borrowers = db.collection("borrowers_account");

  // LOGIN (no JWT required)
  router.post("/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const borrower = await borrowers.findOne({ username });
      if (!borrower) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      let isMatch = false;
      // Check if password is hashed (bcrypt hashes start with $2)
      if (borrower.password && borrower.password.startsWith('$2')) {
        isMatch = await bcrypt.compare(password, borrower.password);
      } else {
        isMatch = password === borrower.password;
      }

      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken({ borrowersId: borrower.borrowersId, role: borrower.role });
      res.json({
        message: "Login successful",
        borrowersId: borrower.borrowersId,
        username: borrower.username,
        name: borrower.name,
        role: borrower.role,
        token
      });
    } catch (error) {
      console.error("Error in borrower login:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Protect all routes below with JWT
  router.use(authenticateToken);

  // ADD BORROWER (no password hashing)
  router.post("/", async (req, res) => {
    try {
      const { username, name, role, password } = req.body;
      const borrowersId = await generateBorrowersId(); // or your own logic

      // Store password as plain text (NOT SECURE)
      const borrower = {
        borrowersId,
        username,
        name,
        role,
        password,
      };

      await borrowers.insertOne(borrower);
      res.status(201).json({ message: "Borrower created", borrowersId });
    } catch (error) {
      console.error("Error creating borrower:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Change password (with hashing)
  router.put('/:id/change-password', async (req, res) => {
    try {
      const { newPassword } = req.body;
      // Hash the new password before saving
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await borrowers.updateOne(
        { borrowersId: req.params.id },
        { $set: { password: hashedPassword } }
      );
      res.json({ message: "Password updated" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
