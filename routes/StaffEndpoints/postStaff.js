const express = require("express");
const router = express.Router();
const { upload, processUploadedDocs } = require("../../Utils/uploadConfig");
const authenticateToken = require("../../Middleware/auth");
const authorizeRole = require("../../Middleware/authorizeRole");

const userRepository = require("../../Repositories/staffRepository");
const { createUser, loginUser } = require("../../Services/staffService");
const sharp = require("sharp");

module.exports = (db) => {
  const repo = userRepository(db);

  // Create a staff user (head only)
  router.post("/", authenticateToken, authorizeRole("head"), async (req, res) => {
    try {
      const { newUser, defaultPassword } = await createUser(req.body, req.user?.username, repo);
  
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
      res.json({ message: "Login successful", ...result });
    } catch (err) {
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

  return router;
};
