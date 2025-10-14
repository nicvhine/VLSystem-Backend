const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/auth');
const authorizeRole = require('../../middleware/authorizeRole');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');  
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

const { encrypt, decrypt } = require('../../utils/crypt'); 
const { createBorrower, loginBorrower, forgotPassword, sendOtp, verifyOtp } = require('../../Services/borrowerService'); 
const borrowerRepoFactory  = require('../../repositories/borrowerRepository');

module.exports = (db) => {
    const repo = borrowerRepoFactory(db);

    router.post("/", async (req, res) => {
        try {
          const newBorrower = await createBorrower(req.body, db, repo);
          res.status(201).json(newBorrower);
        } catch (err) {
          console.error("Error adding borrower:", err);
          res.status(400).json({ message: err.message });
        }
    });

    router.post("/login", async (req, res) => {
        try {
        const { username, password } = req.body;
        const response = await loginBorrower(username, password, repo, JWT_SECRET);
        res.json(response);
        } catch (err) {
        console.error("Login error:", err.message);
        res.status(401).json({ error: err.message });
        }
    });

    router.post("/forgot-password", async (req, res) => {
        try {
          const { username, email } = req.body;
          const result = await forgotPassword(username, email, repo);
          res.json(result);
        } catch (err) {
          console.error("Forgot password error:", err.message);
          res.status(400).json({ error: err.message });
        }
    });

    // SEND OTP
    router.post("/send-otp", async (req, res) => {
        try {
          const { borrowersId } = req.body;
          const result = await sendOtp(borrowersId, repo);
          res.json(result);
        } catch (err) {
          console.error("Send OTP error:", err.message);
          res.status(400).json({ error: err.message });
        }
      });

    // // VERIFY OTP
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