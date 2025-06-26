const express = require('express');
const router = express.Router();
const { generateToken, authenticateToken } = require('../auth');
const bcrypt = require('bcrypt');

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

  // LOGIN (no JWT required)
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    console.log("Login attempt:", { username, password });

    if (!username || !password) {
      console.log("Missing username or password");
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await users.findOne({ username });
    console.log("User found in DB:", user);

    if (!user) {
      console.log("User not found");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let isMatch = false;
    // Allow plain text password only for manager role
    if (user.role === "manager" && !user.password.startsWith('$2')) {
      isMatch = password === user.password;
      console.log("Plain text password check for manager:", isMatch);
    } else {
      isMatch = await bcrypt.compare(password, user.password);
      console.log("Bcrypt password check:", isMatch);
    }

    if (!isMatch) {
      console.log("Password did not match");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken({ userId: user.userId, role: user.role });
    console.log("Login successful for:", user.username);
    res.json({
      message: "Login successful",
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      token
    });
  });

  // Protect all routes below with JWT
  router.use(authenticateToken);

  // GET ALL USERS
  router.get('/', async (req, res) => {
    try {
      const allUsers = await users.find().toArray();
      const mappedUsers = allUsers.map(u => ({
        userId: u.userId || u._id.toString(),
        name: u.name,
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
      const { name, role } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: "Name and role are required" });
      }
      if (!name.trim().includes(" ")) {
        return res.status(400).json({ error: "Please provide full name (first and last)" });
      }

      const username = generateUsername(name);
      if (!username) {
        return res.status(400).json({ error: "Invalid full name" });
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
      const defaultPassword = "123456";
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      const user = {
        userId,
        name,
        role,
        username,
        password: hashedPassword,
      };

      await users.insertOne(user);

      res.status(201).json({ message: "User created", user: { userId, name, role, username } });
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
  router.post('/change-password', async (req, res) => {
    const { userId, oldPassword, newPassword, confirmPassword } = req.body;

    console.log("Change password attempt:", { userId, oldPassword, newPassword, confirmPassword });

    if (!userId || !oldPassword || !newPassword || !confirmPassword) {
      console.log("Missing fields in change password");
      return res.status(400).json({ error: "All fields are required" });
    }
    if (newPassword !== confirmPassword) {
      console.log("New password and confirmation do not match");
      return res.status(400).json({ error: "New password and confirmation do not match" });
    }

    try {
      const user = await users.findOne({ userId });
      console.log("User found for password change:", user);

      if (!user) return res.status(404).json({ error: "User not found" });

      let isMatch = false;
      // Allow plain text password only for manager role (if not hashed)
      if (user.role === "manager" && !user.password.startsWith('$2')) {
        isMatch = oldPassword === user.password;
        console.log("Plain text old password check for manager:", isMatch);
      } else {
        isMatch = await bcrypt.compare(oldPassword, user.password);
        console.log("Bcrypt old password check:", isMatch);
      }
      if (!isMatch) {
        console.log("Old password did not match");
        return res.status(401).json({ error: "Old password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await users.updateOne({ userId }, { $set: { password: hashedPassword } });
      console.log("Password changed successfully for:", user.username);
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
