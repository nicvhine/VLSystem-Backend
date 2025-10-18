const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');
const authorizeRole = require('../../Middleware/authorizeRole');

module.exports = (db) => {
    const users = db.collection('users');

    // DELETE USER BY ID
    router.delete('/:id', authenticateToken, authorizeRole("head"), async (req, res) => {
        try {
        const id = req.params.id;
        const actor = req.user?.username || 'Unknown';
    
        const userToDelete = await users.findOne({ userId: id });
    
        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found' });
        }
    
        const deleteResult = await users.deleteOne({ userId: id });
    
        if (deleteResult.deletedCount === 0) {
            return res.status(500).json({ message: 'Failed to delete user' });
        }
    
        await db.collection('logs').insertOne({
            timestamp: new Date(),
            actor,
            action: "DELETE_USER",
            details: `Deleted user ${userToDelete.username} (${userToDelete.role}) with ID ${userToDelete.userId}.`,
        });
    
        res.status(204).send();
        } catch (err) {
        console.error('Failed to delete user:', err);
        res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}