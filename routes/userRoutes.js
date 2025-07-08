const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const multer = require('multer');
const fs = require('fs');
const path = require('path');

const jwt = require('jsonwebtoken'); 
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
const authenticateToken = require('../middleware/auth');


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


function generateUsername(fullName) {
  const parts = fullName.trim().toLowerCase().split(" ");
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return firstName.slice(0, 3) + lastName;
}

function padId(num) {
  return num.toString().padStart(5, '0');
}

module.exports = (db) => {
  const users = db.collection('users');

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



  // LOGIN
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
        role: user.role,
        profilePic: user.profilePic || null,
        isFirstLogin: user.isFirstLogin !== false,
      }
    });



  });

  // GET ALL USERS
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

// ADD NEW USER
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, email, phoneNumber, role } = req.body;
    const actor = req.user?.username;

    if (!name || !email || !phoneNumber || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (!name.trim().includes(" ")) {
      return res.status(400).json({ message: "Please enter a full name with first and last name." });
    }

    const username = generateUsername(name);
    
    if (!username) {
      return res.status(400).json({ message: "Invalid full name. Cannot generate username." });
    }

    // Check only for duplicate email - allow duplicate names and usernames
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

  // DELETE USER BY ID
router.delete('/:id', authenticateToken, async (req, res) => {
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


  // CHANGE PASSWORD
  router.put('/:id/change-password', async (req, res) => {
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
    
        await db.collection('users').updateOne(
          { userId: id },
          { $set: { password: hashedPassword, isFirstLogin: false } }
        );
    
        res.status(200).json({ message: 'Password updated successfully' });
      } catch (err) {
        console.error("Password update error:", err);
        res.status(500).json({ message: 'Server error while updating password' });
      }
    });

    router.get('/collectors', async (req, res) => {
  try {
    const collectors = await db.collection('users').find({ role: 'Collector' }).toArray();
    const names = collectors.map(c => c.name);
    res.json(names);
  } catch (err) {
    console.error('Failed to fetch collectors:', err);
    res.status(500).json({ error: 'Failed to load collectors' });
  }
});

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

router.put('/:userId/update-email', async (req, res) => {
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

router.put('/:userId/update-phoneNumber', async (req, res) => {
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

  return router;
};