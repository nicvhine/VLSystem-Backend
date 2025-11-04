const express = require("express");
const router = express.Router();
const { upload, processUploadedDocs } = require("../../utils/uploadConfig");
const authenticateToken = require("../../middleware/auth");
const authorizeRole = require("../../middleware/authorizeRole");
const userRepository = require("../../repositories/staffRepository");
const { createUser, loginUser } = require("../../services/staffService");
const sharp = require("sharp");

module.exports = (db) => {
  const repo = userRepository(db);
  const { insertActivityLog } = require("../../repositories/logRepository")(db);

  // Create a staff user (head only)
  router.post("/", authenticateToken, authorizeRole("head"), async (req, res) => {
    try {
      const { newUser, defaultPassword } = await createUser(req.body, req.user?.username, repo);
  
      // Insert activity log
      await insertActivityLog({
        userId: req.user.userId, 
        name: req.user.name,
        role: req.user.role,
        action: "Create Staff Account",
        description: `Head ${req.user.name} created new staff account (${newUser.role}) - ${newUser.userId}`,
        createdAt: new Date(),
      });
  
      // Respond with user data including status
      res.status(201).json({
        message: "User created",
        user: {
          userId: newUser.userId,
          name: newUser.name,
          email: newUser.email,
          phoneNumber: newUser.phoneNumber,
          role: newUser.role,
          username: newUser.username,
          profilePic: newUser.profilePic || null,
          status: newUser.status,
        },
        credentials: {
          username: newUser.username,
          tempPassword: defaultPassword,
        },
      });
    } catch (error) {
      console.error("Error adding user:", error);
      res.status(400).json({ error: error.message });
    }
  });
  

  router.post(
    "/:userId/upload-profile",
    authenticateToken,
    upload.single("profilePic"),
    async (req, res) => {
      const { userId } = req.params;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
      try {
        // Validate 2x2 dimensions (optional, 600x600)
        const metadata = await sharp(req.file.buffer).metadata();
        if (metadata.width !== 600 || metadata.height !== 600) {
          return res.status(400).json({
            error: "Profile picture must be 2x2 inches (600x600 pixels).",
          });
        }
  
        // Upload to Cloudinary
        const uploaded = await processUploadedDocs({ profilePic: [req.file] });
        const profilePic = uploaded[0];
  
        // Save path in DB
        await repo.updateProfilePic(userId, profilePic.filePath);
  
        res.status(200).json({
          message: "Profile uploaded successfully",
          profilePic,
        });
      } catch (err) {
        console.error("Error saving profile pic:", err);
        res.status(500).json({ error: "Server error" });
      }
    }
  );  

  // Staff login
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password are required" });
  
    try {
      const result = await loginUser(username, password, repo);
  
      // Log successful login
      await insertActivityLog({
        userId: result.user.userId,
        name: result.user.name,
        role: result.user.role,
        action: "Login",
        description: `${result.user.role} ${result.user.name} logged in.`,
        createdAt: new Date(),
      });
  
      res.json({ message: "Login successful", ...result });
    } catch (err) {
      console.error("Login error:", err.message);
  
      // Log failed login attempt
      await insertActivityLog({
        userId: "N/A",
        name: username || "Unknown",
        role: "N/A",
        action: "Failed Login Attempt",
        description: `Failed login attempt for username: ${username}`,
        createdAt: new Date(),
      });
  
      res.status(401).json({ error: err.message });
    }
  });

  // Check if staff email is available
  router.post("/check-email", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
      const existingUser = await repo.findByEmail(email);
      if (existingUser) return res.status(409).json({ error: "Email already in use." });
      res.status(200).json({ message: "Email is available" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Check if staff phone number is available
  router.post("/check-phone", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

    try {
      const existingUser = await repo.findByPhoneNumber(phoneNumber);
      if (existingUser) return res.status(409).json({ error: "Phone number already in use." });
      res.status(200).json({ message: "Phone number is available" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Check if staff name is available (case-insensitive exact match)
  router.post("/check-name", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    try {
      const existingUser = await repo.findByName(name.trim());
      if (existingUser) return res.status(409).json({ error: "Name already in use." });
      res.status(200).json({ message: "Name is available" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};
