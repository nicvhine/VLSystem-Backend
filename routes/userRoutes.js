const express = require('express');
const router = express.Router();

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

  // LOGIN
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await users.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ message: "Login successful", userId: user.userId, username: user.username, name: user.name, role: user.role});
  });

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

      const user = {
        userId,
        name,
        role,
        username,
        password: defaultPassword,
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

    if (!userId || !oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation do not match" });
    }

    try {
      const user = await users.findOne({ userId });
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.password !== oldPassword) return res.status(401).json({ error: "Old password is incorrect" });

      await users.updateOne({ userId }, { $set: { password: newPassword } });
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
