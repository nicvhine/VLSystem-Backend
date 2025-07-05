const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

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

    res.json({ message: "Login successful", 
      userId: user.userId, 
      username: user.username, 
      name: user.name, 
      email: user.email,
      role: user.role,  
      isFirstLogin: user.isFirstLogin !== false});

      localStorage.setItem('name', response.name); 

  });

  // GET ALL USERS
  router.get('/', async (req, res) => {
    try {
      const allUsers = await users.find().toArray();
      const mappedUsers = allUsers.map(u => ({
        userId: u.userId || u._id.toString(),
        name: u.name,
        email: u.email,
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
router.post("/", async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (!name.trim().includes(" ")) {
      return res.status(400).json({ message: "Please enter a full name with first and last name." });
    }

    const username = generateUsername(name);
    
    if (!username) {
      return res.status(400).json({ message: "Invalid full name. Cannot generate username." });
    }

    const existingUser = await users.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    
    if (!username) {
      return res.status(400).json({ message: "Invalid full name. Cannot generate username." });
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
      role,
      username,
      password: hashedPassword,
    };

    await users.insertOne(user);

    res.status(201).json({
    message: "User created",
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
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
  router.delete('/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const deleteResult = await users.deleteOne({ userId: id });

      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
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

  return router;
};