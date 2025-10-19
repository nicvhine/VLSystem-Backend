const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');
const bcrypt = require('bcrypt');

// Update staff credentials and profile fields
module.exports = (db) => {
    const users = db.collection('users');

    // Change password (staff)
    router.put('/:id/change-password', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { newPassword } = req.body;
    
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!newPassword || !passwordRegex.test(newPassword)) {
          return res.status(400).json({
            message:
              'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.',
          });
        }
    
        try {
          const user = await users.findOne({ userId: id });
          if (!user) {
            return res.status(404).json({ message: 'User not found' });
          }
    
          const hashedPassword = await bcrypt.hash(newPassword, 10);
          await users.updateOne({ userId: id }, { $set: { password: hashedPassword, isFirstLogin: false } });
    
    
          res.status(200).json({ message: 'Password updated successfully' });
        } catch (err) {
          console.error('Password update error:', err);
          res.status(500).json({ message: 'Server error while updating password' });
        }
    });

    // Update email
    router.put('/:userId/update-email', authenticateToken, async (req, res) => {
        const { userId } = req.params;
        const { email } = req.body;
      
        if (!email) {
          return res.status(400).json({ error: 'Email is required' });
        }
      
        const normalizedEmail = email.trim().toLowerCase();
      
        try {
          const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
          if (existingUser && existingUser.userId !== userId) {
            return res.status(409).json({ error: 'Email already in use.' });
          }
      
          await db.collection('users').updateOne(
            { userId },
            { $set: { email: normalizedEmail } }
          );
      
          res.status(200).json({ message: 'Email updated successfully' });
        } catch (error) {
          console.error('Failed to update email:', error);
          res.status(500).json({ error: 'Server error' });
        }
    });

    // Update phone number
    router.put('/:userId/update-phoneNumber', authenticateToken, async (req, res) => {
        const { userId } = req.params;
        const { phoneNumber } = req.body;
      
        if (!phoneNumber) {
          return res.status(400).json({ error: 'Email is required' });
        }
      
        try {
          const existingUser = await db.collection('users').findOne({ phoneNumber });
          if (existingUser && existingUser.userId !== userId) {
            return res.status(409).json({ error: 'Phone number already in use.' });
          }
      
          await db.collection('users').updateOne(
            { userId },
            { $set: { phoneNumber } }
          );
      
          res.status(200).json({ message: 'Phone number updated successfully' });
        } catch (error) {
          console.error('Failed to update phone number:', error);
          res.status(500).json({ error: 'Server error' });
        }
    });

    // Edit staff details
    router.put('/:userId', authenticateToken, async (req, res) => {
        const { userId } = req.params;
        const { name, email, phoneNumber, role } = req.body;
      
        if (!name && !email && !phoneNumber && !role) {
          return res.status(400).json({ message: 'At least one field must be provided for update.' });
        }
      
        try {
          // Check for duplicate email if email is being updated
          if (email) {
            const normalizedEmail = email.trim().toLowerCase();
            const existingEmailUser = await db.collection('users').findOne({ email: normalizedEmail });
            if (existingEmailUser && existingEmailUser.userId !== userId) {
              return res.status(409).json({ message: 'Email already in use by another user.' });
            }
          }
      
          // Check for duplicate phoneNumber if phoneNumber is being updated
          if (phoneNumber) {
            const existingPhoneUser = await db.collection('users').findOne({ phoneNumber });
            if (existingPhoneUser && existingPhoneUser.userId !== userId) {
              return res.status(409).json({ message: 'Phone number already in use by another user.' });
            }
          }
      
          const updateFields = { updatedAt: new Date() };
          if (name) updateFields.name = name;
          if (email) updateFields.email = email.trim().toLowerCase();
          if (phoneNumber) updateFields.phoneNumber = phoneNumber;
          if (role) updateFields.role = role;
      
          const updateResult = await db.collection('users').updateOne(
            { userId }, 
            { $set: updateFields }
          );
      
          if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
          }
      
          const updatedUser = await db.collection('users').findOne({ userId });
          res.status(200).json({ message: 'User updated successfully', user: updatedUser });
      
        } catch (error) {
          console.error('Failed to update user:', error);
          res.status(500).json({ message: 'Server error' });
        }
    });
    
    return router;
}