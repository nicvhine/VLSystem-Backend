const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

//GENERATE USERNAME
function generateUsername(fullName) {
  const parts = fullName.trim().toLowerCase().split(" ");
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return firstName.slice(0, 3) + lastName;
}

//GENERATE ID
function padId(num) {
  return num.toString().padStart(5, '0');
}

module.exports = (db) => {
  const borrowers = db.collection("borrowers_account");
  const { generateToken } = require('../auth');

  const { authenticateToken } = require('../auth');

// LOGIN
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const borrower = await borrowers.findOne({ username });
  if (!borrower) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

const isMatch = await bcrypt.compare(password, borrower.password);
  if (!isMatch) {
  return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = generateToken({ borrowersId: borrower.borrowersId, role: "borrower"});
  return res.json({
  message: "Login successful",
  name: borrower.name,
  username: borrower.username,
  role: "borrower",
  borrowersId: borrower.borrowersId,
  isFirstLogin: borrower.isFirstLogin !== false, 
  token
  });

  });

//ADD BORROWER
 router.post("/", async (req, res) => {
  try {
    const { name, role, applicationId, assignedCollector } = req.body;

    if (!name || !role || !applicationId) {
      return res.status(400).json({ error: "Name, role, and applicationId are required" });
    }

    if (!name.trim().includes(" ")) {
      return res.status(400).json({ error: "Please provide full name (first and last)" });
    }

    const application = await db.collection("loan_applications").findOne({ applicationId });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const username = generateUsername(name);
    if (!username) {
      return res.status(400).json({ error: "Invalid full name" });
    }

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

    const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
    const birthDate = new Date(application.appDob);
    const formattedDate = `${birthDate.getFullYear()}${(birthDate.getMonth() + 1).toString().padStart(2, '0')}${birthDate.getDate().toString().padStart(2, '0')}`;

    const defaultPassword = `${lastName}${formattedDate}`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const borrower = {
      borrowersId,
      name,
      role,
      username,
      password: hashedPassword,
      isFirstLogin: true,
      assignedCollector,
      dateOfBirth: application.appDob,
      maritalStatus: application.appMarital,
      numberOfChildren: application.appChildren,
      contactNumber: application.appContact,
      emailAddress: application.appEmail,
      address: application.appAdress,
      barangay: application.appBarangay,
      municipality: application.appMunicipality,
      province: application.appProvince,
      houseStatus: application.appHouseStatus,
      sourceOfIncome: application.sourceOfIncome,
      occupation: application.appOccupation,
      monthlyIncome: application.appMonthlyIncome,
      characterReferences: application.appReferences || [],
      score: application.score || 0,
      imageUrl: application.imageUrl || null,
    };

    await borrowers.insertOne(borrower);

    await db.collection("loan_applications").updateOne(
      { applicationId },
      { $set: { borrowersId, username } }
    );

    res.status(201).json({
    message: "Borrower created",
    borrower: {
      ...borrower,
      password: undefined  
    },
    tempPassword: defaultPassword 
  });

  } catch (error) {
    console.error("Error adding borrower:", error);
    res.status(500).json({ error: "Failed to add borrower" });
  }
});

//CHANGE PASSWORD
router.put('/:id/change-password', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  if (!newPassword || !passwordRegex.test(newPassword)) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.'
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.collection('borrowers_account').updateOne(
      { borrowersId: id },
      { $set: { password: hashedPassword, isFirstLogin: false } }
    );

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ message: 'Server error while updating password' });
  }
});

  return router;
};