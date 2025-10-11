const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/auth');
const authorizeRole = require('../../middleware/authorizeRole');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');  
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

const { encrypt, decrypt } = require('../../utils/crypto'); 

function padId(num) {
  return num.toString().padStart(5, '0');
}
module.exports = (db) => {
    const borrowers = db.collection("borrowers_account");

    //Add borrower
    router.post("/", authenticateToken, authorizeRole("manager"), async (req, res) => {
        try {
        const { name, role, applicationId, assignedCollector } = req.body;
        if (!name || !role || !applicationId) return res.status(400).json({ error: "Name, role, and applicationId are required" });
        if (!name.trim().includes(" ")) return res.status(400).json({ error: "Please provide full name (first and last)" });

        const application = await db.collection("loan_applications").findOne({ applicationId });
        if (!application) return res.status(404).json({ error: "Application not found" });

        // Generate unique username
        async function generateUniqueUsername(name, borrowers) {
            const parts = name.trim().toLowerCase().split(" ");
            if (parts.length < 2) return null;
            let baseUsername = parts[0].slice(0, 3) + parts[parts.length - 1];
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
            { $addFields: { borrowerIdNum: { $toInt: { $substr: ["$borrowersId", 1, -1] } } } },
            { $sort: { borrowerIdNum: -1 } },
            { $limit: 1 }
        ]).toArray();

        const nextId = (maxBorrower.length > 0 && !isNaN(maxBorrower[0].borrowerIdNum)) ? maxBorrower[0].borrowerIdNum + 1 : 1;
        const borrowersId = 'B' + padId(nextId);

        // Default password
        const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
        const birthDate = new Date(application.appDob);
        const formattedDate = `${birthDate.getFullYear()}${(birthDate.getMonth() + 1).toString().padStart(2, '0')}${birthDate.getDate().toString().padStart(2, '0')}`;
        const defaultPassword = `${lastName}${formattedDate}`;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const profilePicUrl = application.profilePic
        ? `http://localhost:3001/${application.profilePic.filePath.replace(/\\/g, "/")}`
        : null;

        // Borrower object
        const borrower = {
            borrowersId,
            name: encrypt(name),
            role,
            username: encrypt(username),
            password: hashedPassword,
            isFirstLogin: true,
            assignedCollector,
            email: application.appEmail,
            score: application.score || 0,
            profilePic: profilePicUrl
        };

        await borrowers.insertOne(borrower);
        await db.collection("loan_applications").updateOne({ applicationId }, { $set: { borrowersId, username } });

        res.status(201).json({ message: "Borrower created", borrower: { ...borrower, password: undefined }, tempPassword: defaultPassword });
        } catch (error) {
        console.error("Error adding borrower:", error);
        res.status(500).json({ error: "Failed to add borrower" });
        }
    });

    //Login
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
        email: decrypt(borrower.email),
        role: "borrower",
        profilePic: borrower.profilePic || null,
        borrowersId: borrower.borrowersId,
        isFirstLogin: borrower.isFirstLogin !== false,
        token
        });
    });

    //Forgot password
    router.post("/forgot-password", async (req, res) => {
        const { username, email } = req.body;
        if (!username || !email) return res.status(400).json({ error: "Username and email are required" });

        const borrower = await borrowers.findOne({ username, email: email });
        if (!borrower) return res.status(404).json({ error: "No account found with that username and email" });

        res.json({
        message: "Borrower found",
        borrowersId: borrower.borrowersId,
        username: borrower.username,
        email: borrower.email,
        });
    });

    // SEND OTP
    router.post("/send-otp", async (req, res) => {
        const { borrowersId } = req.body;
        if (!borrowersId) return res.status(400).json({ error: "borrowersId is required" });

        const borrower = await borrowers.findOne({ borrowersId });
        if (!borrower) return res.status(404).json({ error: "Borrower not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[borrowersId] = { otp, expires: Date.now() + 5 * 60 * 1000 };

        console.log(`OTP for ${borrower.email}: ${otp}`);
        res.json({ message: "OTP sent to your email address" });
    });

    // VERIFY OTP
    router.post("/verify-otp", (req, res) => {
        const { borrowersId, otp } = req.body;
        if (!borrowersId || !otp) return res.status(400).json({ error: "borrowersId and otp are required" });

        const record = otpStore[borrowersId];
        if (!record) return res.status(400).json({ error: "No OTP found" });
        if (Date.now() > record.expires) return res.status(400).json({ error: "OTP expired" });
        if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

        res.json({ message: "OTP verified successfully" });
    });

    return router;
}