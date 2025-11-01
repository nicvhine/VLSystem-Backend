const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');
const authorizeRole = require('../../Middleware/authorizeRole');

// Read staff list and collectors
module.exports = (db) => {
    const users = db.collection('users');

    // Get all users (head only)
    router.get('/', authenticateToken, authorizeRole("head"), async (req, res) => {
        try {
        const allUsers = await users.find().toArray();
        
        const mappedUsers = allUsers.map(u => ({
            userId: u.userId || u._id.toString(),
            name: u.name,
            email: u.email,
            phoneNumber: u.phoneNumber,
            role: u.role,
            username: u.username,
        }));
        res.json(mappedUsers);
        } catch (err) {
        console.error('Failed to fetch users:', err);
        res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Get collector names
    router.get('/collectors', authenticateToken, async (req, res) => {
      try {
        const collectors = await users.find({ role: 'collector' }).toArray();
        const mappedCollectors = collectors.map(c => ({
          userId: c.userId || c._id.toString(),
          name: c.name,
        }));
        res.json(mappedCollectors);
      } catch (err) {
        console.error('Failed to fetch collectors:', err);
        res.status(500).json({ error: 'Failed to load collectors' });
      }
    });
    return router;
}
