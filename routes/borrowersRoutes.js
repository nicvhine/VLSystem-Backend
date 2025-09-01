  const express = require('express');
  const router = express.Router();
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken'); 
  const multer = require('multer');
  const fs = require('fs');
  const path = require('path');
  require('dotenv').config();

  const JWT_SECRET = process.env.JWT_SECRET;
  const authenticateToken = require('../middleware/auth');

  const uploadDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `profile_${Date.now()}${ext}`);
    },
  });

  const upload = multer({ storage });

  // Temporary OTP storage (use Redis/DB in production)
  const otpStore = {};  

  // Helper functions
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

    // Upload Profile
    router.post('/:borrowersId/upload-profile', upload.single('profilePic'), async (req, res) => {
      const { borrowersId } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const profilePic = `/uploads/${req.file.filename}`;
      try {
        await borrowers.updateOne(
          { borrowersId },
          { $set: { profilePic } }
        );
        res.status(200).json({ message: 'Profile uploaded successfully', profilePic });
      } catch (err) {
        console.error('Error saving profile pic:', err);
        res.status(500).json({ error: 'Server error' });
      }
    });

    // Login
    router.post("/login", async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const borrower = await borrowers.findOne({ username });
      if (!borrower) return res.status(401).json({ error: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, borrower.password);
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { borrowersId: borrower.borrowersId, role: "borrower" },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        message: "Login successful",
        name: borrower.name,
        username: borrower.username,
        role: "borrower",
        profilePic: borrower.profilePic || null,
        borrowersId: borrower.borrowersId,
        isFirstLogin: borrower.isFirstLogin !== false,
        token
      });
    });

router.post("/forgot-password", async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: "Username and email are required" });
  }

  const borrower = await borrowers.findOne({ username, emailAddress: email });

  if (!borrower) {
    return res.status(404).json({ error: "No account found with that username and email" });
  }

  res.json({
    message: "Borrower found",
    borrowersId: borrower.borrowersId,
    username: borrower.username,
    email: borrower.emailAddress,
  });
});



   // Forgot Password - Step 2: Send OTP to email
router.post("/send-otp", async (req, res) => {
  const { borrowersId } = req.body;
  if (!borrowersId) return res.status(400).json({ error: "borrowersId is required" });

  const borrower = await borrowers.findOne({ borrowersId });
  if (!borrower) return res.status(404).json({ error: "Borrower not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[borrowersId] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  // TODO: Replace with actual email service (EmailJS, nodemailer, etc.)
  console.log(`OTP for ${borrower.emailAddress}: ${otp}`);

  res.json({ message: "OTP sent to your email address" });
});


    // Forgot Password - Step 3: Verify OTP
router.post("/verify-otp", (req, res) => {
  const { borrowersId, otp } = req.body;
  if (!borrowersId || !otp) return res.status(400).json({ error: "borrowersId and otp are required" });

  const record = otpStore[borrowersId];
  if (!record) return res.status(400).json({ error: "No OTP found" });
  if (Date.now() > record.expires) return res.status(400).json({ error: "OTP expired" });
  if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

  res.json({ message: "OTP verified successfully" });
});


    // Forgot Password - Step 4: Reset Password
    router.put("/reset-password/:id", async (req, res) => {
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
        await borrowers.updateOne(
          { borrowersId: id },
          { $set: { password: hashedPassword, isFirstLogin: false } }
        );
        res.status(200).json({ message: 'Password reset successfully' });
      } catch (err) {
        console.error("Password reset error:", err);
        res.status(500).json({ message: 'Server error while resetting password' });
      }
    });

    // Get Borrower by ID
    router.get('/:id', authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;
        const borrower = await borrowers.findOne({ borrowersId: id });
        if (!borrower) return res.status(404).json({ error: "Borrower not found" });
        res.json(borrower);
      } catch (error) {
        console.error("Error fetching borrower:", error);
        res.status(500).json({ error: "Failed to fetch borrower" });
      }
    });

   // Add Borrower
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
    if (!application) return res.status(404).json({ error: "Application not found" });

    // Generate unique username
    async function generateUniqueUsername(name, borrowers) {
      const parts = name.trim().toLowerCase().split(" ");
      if (parts.length < 2) return null;
      const baseUsername = parts[0].slice(0, 3) + parts[parts.length - 1];

      let username = baseUsername;
      let count = 1;

      while (await borrowers.findOne({ username })) {
        count++;
        username = baseUsername + count;
      }

      return username;
    }

    const username = await generateUniqueUsername(name, borrowers);
    if (!username) return res.status(400).json({ error: "Invalid full name" });

    // Generate borrowersId
    const maxBorrower = await borrowers.aggregate([
      {
        $addFields: {
          borrowerIdNum: { $toInt: { $substr: ["$borrowersId", 1, -1] } }
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

    // Default password
    const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
    const birthDate = new Date(application.appDob);
    const formattedDate = `${birthDate.getFullYear()}${(birthDate.getMonth() + 1).toString().padStart(2, '0')}${birthDate.getDate().toString().padStart(2, '0')}`;
    const defaultPassword = `${lastName}${formattedDate}`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Borrower object
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
      borrower: { ...borrower, password: undefined },
      tempPassword: defaultPassword
    });

  } catch (error) {
    console.error("Error adding borrower:", error);
    res.status(500).json({ error: "Failed to add borrower" });
  }
});


    return router;
  };
