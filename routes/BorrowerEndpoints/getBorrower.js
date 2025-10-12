const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');  
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
const authenticateToken = require('../../middleware/auth');

const { decrypt } = require('../../utils/crypt'); 

module.exports = (db) => {
    const borrowers = db.collection("borrowers_account");

    // Get borrower by Id
    router.get('/:id', authenticateToken, async (req, res) => {
        try {
          const { id } = req.params;
      
          const borrower = await borrowers.findOne({ borrowersId: id });
          if (!borrower) return res.status(404).json({ error: "Borrower not found" });
      
          const hasActiveLoan = await db.collection('loans').findOne({
            borrowersId: id,
            status: "Active"
          });
      
          const profilePicUrl = borrower.profilePic?.filePath
            ? `http://localhost:3001/${borrower.profilePic.filePath.replace(/\\/g, "/")}`
            : null;
      
          const borrowerDetails = {
            name: decrypt(borrower.name),
            username: decrypt(borrower.username),
            email: decrypt(borrower.email),
            role: "borrower",
            isFirstLogin: borrower.isFirstLogin !== false,
            borrowersId: borrower.borrowersId,
            profilePic: profilePicUrl,
            status: hasActiveLoan ? "Active" : "Inactive"
          };
      
          res.json({ borrowerDetails });
        } catch (error) {
          console.error("Error fetching borrower:", error);
          res.status(500).json({ error: "Failed to fetch borrower" });
        }
      });      

    return router;
};
