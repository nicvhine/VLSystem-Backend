const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId, ReturnDocument } = require('mongodb');
const { configDotenv } = require('dotenv');
const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const uri = 'mongodb+srv://nichole:nichole@cluster0.gxpgomv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);


async function getNextSequence(db, name) {
  const counters = db.collection('counters');

  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );

  if (!result.value || typeof result.value.seq !== 'number') {
    await counters.updateOne(
      { _id: name },
      { $set: { seq: 1 } },
      { upsert: true }
    );
    return 1;
  }

  return result.value.seq;
}


async function start() {
  try {
    await client.connect();
    const db = client.db('VLSystem');
    const users = db.collection('users');
    const counters = db.collection('counters');

    const maxUserAgg = await users.aggregate([
  {
    $addFields: {
      userIdNum: { $toInt: "$userId" }  
    }
  },
  { $sort: { userIdNum: -1 } },      
  { $limit: 1 }
]).toArray();

let maxSeq = 0;
if (maxUserAgg.length > 0) {
  maxSeq = maxUserAgg[0].userIdNum;
}

await counters.updateOne(
  { _id: 'userId' },
  { $set: { seq: maxSeq } },
  { upsert: true }
);

console.log("Counter initialized to:", maxSeq);


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

// LOGIN
  app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await users.findOne({ username });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ message: "Login successful", userId: user.userId, username: user.username, name: user.name, role: user.role});
  });

// GET ALL USERS
  app.get('/users', async (req, res) => {
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
  app.post("/users", async (req, res) => {
    try {
      const { name, role } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: "Name and role are required" });
      }

      if (!name.trim().includes(" ")) {
        return res.status(400).json({
          error: "Please provide full name (first and last)",
        });
      }

      const username = generateUsername(name);
      if (!username) {
        return res.status(400).json({ error: "Invalid full name" });
      }

      const maxUser = await users.aggregate([
        {
          $addFields: {
            userIdNum: { $toInt: "$userId" }
          }
        },
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

      const result = await users.insertOne(user);

      const insertedUser = {
        userId,
        name,
        role,
        username,
      };

      res.status(201).json({ message: "User created", user: insertedUser });
    } catch (error) {
      console.error("Error adding user:", error);
      res.status(500).json({ error: "Failed to add user" });
    }
  });

// DELETE USER BY ID
  app.delete('/users/:id', async (req, res) => {
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
  app.post('/change-password', async (req, res) => {
    const { userId, oldPassword, newPassword, confirmPassword } = req.body;

    if (!userId || !oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation do not match" });
    }

    try {
      const user = await users.findOne({ userId });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.password !== oldPassword) {
        return res.status(401).json({ error: "Old password is incorrect" });
      }

      await users.updateOne(
        { userId },
        { $set: { password: newPassword } }
      );

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // === ADD APPLICATION WITHOUT COLLATERAL ===
    app.post("/loan-applications/without", async (req, res) => {
      try {
        const loanApplications = db.collection("loan_applications");
        const {
          appName, appDob, appContact, appEmail, appMarital, appChildren,
          appSpouseName, appSpouseOccupation, appAddress, appTypeBusiness,
          appDateStarted, appBusinessLoc, appMonthlyIncome, appOccupation,
          appEmploymentStatus, appCompanyName, appLoanPurpose, appLoanAmount,
          appLoanTerms, appInterest
        } = req.body;

        if (!appName || !appDob || !appContact || !appEmail || !appAddress || !appEmploymentStatus || !appLoanPurpose || !appLoanAmount || !appLoanTerms) {
          return res.status(400).json({ error: "All required fields must be provided." });
        }

        const applicationIdSeq = await getNextSequence(db, "applicationId");
        const applicationId = `APP${applicationIdSeq.toString().padStart(5, "0")}`;

        const newApplication = {
          applicationId, appName, appDob, appContact, appEmail, appMarital, appChildren,
          appSpouseName, appSpouseOccupation, appAddress, appTypeBusiness,
          appDateStarted, appBusinessLoc, appMonthlyIncome, appOccupation,
          appEmploymentStatus, appCompanyName, appLoanPurpose, appLoanAmount,
          appLoanTerms, appInterest,
          hasCollateral: false,
          status: "Pending",
          dateApplied: new Date()
        };

        await loanApplications.insertOne(newApplication);
        res.status(201).json({ message: "Loan application (no collateral) submitted successfully", application: newApplication });
      } catch (error) {
        console.error("Error in /basic loan application:", error);
        res.status(500).json({ error: "Failed to submit loan application." });
      }
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

start();
