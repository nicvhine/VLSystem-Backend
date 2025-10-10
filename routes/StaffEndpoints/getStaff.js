const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');

module.exports = (db) => {
    const users = db.collection('users');

    //Get all users
    router.get('/', authenticateToken, async (req, res) => {
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
    
    return router;
}
