const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/auth');
const authorizeRole = require('../../middleware/authorizeRole');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); 
const JWT_SECRET = process.env.JWT_SECRET;

const multer = require('multer');
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

function padId(num) {
  return num.toString().padStart(5, '0');
}

async function generateUniqueUsername(name, role, users) {
  const parts = name.trim().toLowerCase().split(" ");
  if (parts.length < 1) return null;

  const firstName = parts[0];
  const baseUsername = `${role.toLowerCase()}${firstName}`;

  let username = baseUsername;
  let count = 1;

  while (await users.findOne({ username })) {
    count++;
    username = baseUsername + count;
  }

  return username;
}

module.exports = (db) => {
    const users = db.collection('users');

    // Add new user
    router.post("/", authenticateToken, authorizeRole("head"), async (req, res) => {
        try {
        const { name, email, phoneNumber, role } = req.body;
        const actor = req.user?.username;
    
        if (!name || !email || !phoneNumber || !role) {
            return res.status(400).json({ message: "All fields are required." });
        }
    
        if (!name.trim().includes(" ")) {
            return res.status(400).json({ message: "Please enter a full name with first and last name." });
        }
    
        const username = await generateUniqueUsername(name, role, users);
        if (!username) {
            return res.status(400).json({ message: "Invalid full name. Cannot generate username." });
        }
    
        const existingUser = await users.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: "Email address is already registered. Please use a different email." });
        }
    
        const maxUser = await users.aggregate([
            { $addFields: { userIdNum: { $toInt: "$userId" } } },
            { $sort: { userIdNum: -1 } },
            { $limit: 1 }
        ]).toArray();
    
        let nextId = 1;
        if (maxUser.length > 0 && !isNaN(maxUser[0].userIdNum)) {
            nextId = maxUser[0].userIdNum + 1;
        }
    
        const userId = padId(nextId);
        const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
        const defaultPassword = `${lastName}${userId}`;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
        const user = {
            userId,
            name,
            email: email.toLowerCase(),
            phoneNumber,
            role,
            username,
            password: hashedPassword,
        };
    
        await users.insertOne(user);
    
        await db.collection('logs').insertOne({
            timestamp: new Date(),
            actor,
            action: "CREATE_USER",
            details: `Created user ${user.username} (${user.role}) with ID ${userId}.`,
        });
    
        res.status(201).json({
            message: "User created",
            user: {
            userId: user.userId,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            username: user.username,
            profilePic: user.profilePic || null
            },
            credentials: {
            username: user.username,
            password: defaultPassword,
            }
        });
    
        } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).json({ error: "Failed to add user" });
        }
    });

    //Profile upload
    router.post('/:userId/upload-profile', upload.single('profilePic'), async (req, res) => {
        const { userId } = req.params;
      
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
      
        const profilePic = `/uploads/${req.file.filename}`;
      
        try {
          await db.collection('users').updateOne(
            { userId },
            { $set: { profilePic } }
          );
      
          res.status(200).json({ message: 'Profile uploaded successfully', profilePic });
        } catch (err) {
          console.error('Error saving profile pic:', err);
          res.status(500).json({ error: 'Server error' });
        }
      });

    //Login
    router.post("/login", async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
        }

        const user = await users.findOne({ username });
        if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
        {
            userId: user.userId,
            role: user.role,
            username: user.username,
            email: user.email,
            phoneNumber: user.phoneNumber,
            name: user.name,
        },
        JWT_SECRET,
        { expiresIn: '1h' }
        );

        res.json({
        message: "Login successful",
        token,
        user: {
            userId: user.userId,
            username: user.username,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            profilePic: user.profilePic || null,
            isFirstLogin: user.isFirstLogin !== false,
        }
        });

    //Editing: check email
    router.post('/check-email', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
      
        try {
          const existingUser = await db.collection('users').findOne({ email });
          if (existingUser) {
            return res.status(409).json({ error: 'Email already in use.' });
          }
          return res.status(200).json({ message: 'Email is available' });
        } catch (err) {
          console.error('Error checking email:', err);
          return res.status(500).json({ error: 'Server error' });
        }
      });

    });
  
    return router;
};
