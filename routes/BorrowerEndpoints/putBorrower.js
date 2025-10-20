const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');  
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = require('../../Middleware/auth');

// Reset and change borrower passwords
module.exports = (db) => {
  const borrowers = db.collection("borrowers_account");

  // Reset password by id (forgot password flow)
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

  // Change password (only by logged-in borrower)
  router.put('/:id/change-password', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { newPassword, currentPassword } = req.body;

    if (req.user.borrowersId !== id) {
      return res.status(403).json({ message: 'Unauthorized: You can only change your own password.' });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!newPassword || !passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.' 
      });
    }

    try {
      const user = await borrowers.findOne({ borrowersId: id });
      if (!user) return res.status(404).json({ message: 'Borrower not found' });

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) return res.status(400).json({ message: 'Incorrect current password' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await borrowers.updateOne(
        { borrowersId: id },
        { $set: { password: hashedPassword, isFirstLogin: false} }
      );

      res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Password update error:', err);
      res.status(500).json({ message: 'Server error while updating password' });
    }
  });

  return router;
};
