const express = require('express');
const router = express.Router();
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

const { createBorrower, loginBorrower, forgotPassword, sendOtp, verifyOtp } = require('../../Services/borrowerService'); 

// Register borrower, login, recovery, and OTP routes
module.exports = (db) => {

    // Create borrower account
    router.post("/", async (req, res) => {
        try {
          const newBorrower = await createBorrower(req.body, db);
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

    // Borrower forgot password
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
          const result = verifyOtp(borrowersId, otp);
          res.json(result);
        } catch (err) {
          console.error("Verify OTP error:", err.message);
          res.status(400).json({ error: err.message });
        }
      });

    return router;
}