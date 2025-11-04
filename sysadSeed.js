require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function seedSysAd() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "VLSystem");
    const users = db.collection("users");

    // Check if SysAd already exists
    const existing = await users.findOne({ role: "sysad" });
    if (existing) {
      console.log("SysAd account already exists:", existing.username);
      return;
    }

    // Generate password hash
    const hashedPassword = await bcrypt.hash("SysAd@123", 10);

    // Create SysAd record
    const sysad = {
      userId: "Sys00001", 
      name: "System Administrator",
      username: "sysad",
      email: "sysad@vlsystem.local",
      phoneNumber: "0000000000",
      password: hashedPassword,
      role: "sysad",
      isFirstLogin: true,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await users.insertOne(sysad);

    console.log("SysAd account created successfully!");
    console.log("Username: sysad");
    console.log("Password: SysAd@123");
    console.log("User ID: Sys00001");
  } catch (err) {
    console.error("Error seeding SysAd:", err);
  } finally {
    await client.close();
  }
}

seedSysAd();
