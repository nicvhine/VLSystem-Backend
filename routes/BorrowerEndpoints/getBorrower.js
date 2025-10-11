const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');  
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
const authenticateToken = require('../middleware/auth');

module.exports = (db) => {
    const borrowers = db.collection("borrowers_account");

    //Get borrower by Id
    router.get('/:id', authenticateToken, async (req, res) => {
        try {
        const { id } = req.params;
        const borrower = await borrowers.findOne({ borrowersId: id });
        if (!borrower) return res.status(404).json({ error: "Borrower not found" });

        const profilePicUrl = borrower.profilePic
        ? `http://localhost:3001/${borrower.profilePic.filePath.replace(/\\/g, "/")}`
        : null;
        
        
        
        res.json({ ...borrower, profilePic: profilePicUrl });
        } catch (error) {
        console.error("Error fetching borrower:", error);
        res.status(500).json({ error: "Failed to fetch borrower" });
        }
    });

    return router;
}
