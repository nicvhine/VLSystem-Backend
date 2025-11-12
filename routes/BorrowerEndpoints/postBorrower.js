const express = require('express');
const router = express.Router();
require('dotenv').config();
const logRepository = require("../../repositories/logRepository"); 

const JWT_SECRET = process.env.JWT_SECRET;
const {
  createBorrower,
  loginBorrower,
  forgotPassword,
  sendOtp,
  verifyOtp,
  findBorrowerAccount,
} = require('../../services/borrowerService');
const authenticateToken = require('../../middleware/auth');
const authorizeRole = require('../../middleware/authorizeRole');

module.exports = (db) => {
  const logRepo = logRepository(db); 
  
  // Create borrower account
  router.post("/", authenticateToken, authorizeRole("manager"), async (req, res) => {
    try {
      const newBorrower = await createBorrower(req.body, db);

      const creatorName = req.user.name;

      await logRepo.insertActivityLog({
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        action: "CREATE_BORROWER",
        description: `${creatorName} added a new borrower account: ${newBorrower.name}`,
      });

      res.status(201).json(newBorrower);
    } catch (err) {
      console.error("Error adding borrower:", err);
      res.status(400).json({ message: err.message });
    }
  });

  // Borrower login
  router.post("/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const response = await loginBorrower(username, password, db, JWT_SECRET);
      res.json(response);
    } catch (err) {
      console.error("Login error:", err.message);
      res.status(401).json({ error: err.message });
    }
  });

  // Forgot password
  router.post("/forgot-password", async (req, res) => {
    try {
      const { username, email } = req.body;
      const result = await forgotPassword(username, email, db);
      res.json(result);
    } catch (err) {
      console.error("Forgot password error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // Send OTP
  router.post("/send-otp", async (req, res) => {
    try {
      const { borrowersId } = req.body;
      const result = await sendOtp(borrowersId, db);
      res.json(result);
    } catch (err) {
      console.error("Send OTP error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // Verify OTP
  router.post("/verify-otp", async (req, res) => {
    try {
      const { borrowersId, otp } = req.body;
      const result = await verifyOtp(borrowersId, otp);
      res.json(result);
    } catch (err) {
      console.error("Verify OTP error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // Find borrower account (for login or password recovery)
  router.post("/find-account", async (req, res) => {
    try {
      const { identifier } = req.body;
      console.log("Incoming find-account request:", req.body);

      const result = await findBorrowerAccount(identifier, db);
      res.json(result);
    } catch (err) {
      console.error("Find account error:", err.message);
      const status = err.message.includes("not found") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
};
