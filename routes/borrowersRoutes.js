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

module.exports = (db) => {
  const borrowers = db.collection("borrowers_account");

  // LOGIN
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const borrower = await borrowers.findOne({ username });
    if (!borrower || borrower.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({
      message: "Login successful",
      name: borrower.name,
      username: borrower.username,
      role: "borrower",
      borrowersId: borrower.borrowersId, 
    });
  });

//ADD BORROWER
 router.post("/", async (req, res) => {
  try {
    const { name, role, applicationId } = req.body;

    if (!name || !role || !applicationId) {
      return res.status(400).json({ error: "Name, role, and applicationId are required" });
    }

    if (!name.trim().includes(" ")) {
      return res.status(400).json({ error: "Please provide full name (first and last)" });
    }

    const username = generateUsername(name);
    if (!username) {
      return res.status(400).json({ error: "Invalid full name" });
    }

    // Generate next borrower ID
    const maxBorrower = await borrowers.aggregate([
      {
        $addFields: {
          borrowerIdNum: {
            $toInt: { $substr: ["$borrowersId", 1, -1] }
          }
        }
      },
      { $sort: { borrowerIdNum: -1 } },
      { $limit: 1 }
    ]).toArray();

    let nextId = 1;
    if (maxBorrower.length > 0 && !isNaN(maxBorrower[0].borrowerIdNum)) {
      nextId = maxBorrower[0].borrowerIdNum + 1;
    }

    const borrowersId = 'B' + padId(nextId);
    const defaultPassword = "123456";

    const borrower = {
      borrowersId,
      name,
      role,
      username,
      password: defaultPassword,
    };

    await borrowers.insertOne(borrower);

    // Update the related loan application with this borrower ID
    await db.collection("loan_applications").updateOne(
      { applicationId },
      { $set: { borrowersId, username } }
    );

    res.status(201).json({ message: "Borrower created", borrower: { borrowersId, name, role, username } });
  } catch (error) {
    console.error("Error adding borrower:", error);
    res.status(500).json({ error: "Failed to add borrower" });
  }
});

  return router;
};
