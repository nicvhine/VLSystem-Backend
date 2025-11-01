const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
require('dotenv').config();
const authenticateToken = require('../../Middleware/auth');

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

  router.put('/:id/assign-collector', async (req, res) => {
    const { id } = req.params;
    const { assignedCollector } = req.body;

    if (!assignedCollector) {
      return res.status(400).json({ message: "assignedCollector is required." });
    }

    try {
      const borrower = await borrowers.findOne({ borrowersId: id });
      if (!borrower) return res.status(404).json({ message: "Borrower not found." });

      await borrowers.updateOne(
        { borrowersId: id },
        { $set: { assignedCollector } }
      );

      res.status(200).json({ message: `Collector updated successfully to ${assignedCollector}` });
    } catch (err) {
      console.error("Error updating assigned collector:", err);
      res.status(500).json({ message: "Server error while updating collector." });
    }
  });

  router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, email, phoneNumber, profilePic } = req.body;

    if (!name && !email && !phoneNumber && !profilePic) {
      return res.status(400).json({ message: "At least one field must be provided to update." });
    }

    try {
      const borrower = await borrowers.findOne({ borrowersId: id });
      if (!borrower) return res.status(404).json({ message: "Borrower not found." });

      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (profilePic) updateData.profilePic = profilePic;

      await borrowers.updateOne(
        { borrowersId: id },
        { $set: updateData }
      );

      res.status(200).json({ message: "Borrower details updated successfully.", updatedFields: updateData });
    } catch (err) {
      console.error("Error updating borrower details:", err);
      res.status(500).json({ message: "Server error while updating borrower details." });
    }
  });

  
  return router;
};
