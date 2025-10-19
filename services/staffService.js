const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { padId } = require("../Utils/generator");
const { generateStaffUsername } = require("../Utils/username")

const JWT_SECRET = process.env.JWT_SECRET;

// Create a staff user and return temp password
async function createUser({ name, email, phoneNumber, role }, actor, repo) {
  if (!name || !email || !phoneNumber || !role)
    throw new Error("All fields are required.");

  if (!name.trim().includes(" "))
    throw new Error("Please enter a full name with first and last name.");

  const username = await generateStaffUsername(name, role, repo);
  if (!username) throw new Error("Cannot generate username.");

  const existingUser = await repo.findByEmail(email);
  if (existingUser) throw new Error("Email already registered.");

  const maxUser = await repo.findMaxUser();
  let nextId = 1;
  if (maxUser.length > 0 && !isNaN(maxUser[0].userIdNum))
    nextId = maxUser[0].userIdNum + 1;

  const userId = padId(nextId);
  const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
  const defaultPassword = `${lastName}${userId}`;
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const newUser = {
    userId,
    name,
    email: email.toLowerCase(),
    phoneNumber,
    role,
    username,
    password: hashedPassword,
  };

  await repo.insertUser(newUser);
  await repo.logAction({
    timestamp: new Date(),
    actor,
    action: "CREATE_USER",
    details: `Created user ${newUser.username} (${newUser.role}) with ID ${userId}.`,
  });

  return { newUser, defaultPassword };
}

// Authenticate staff user and return JWT plus profile
async function loginUser(username, password, repo) {
  const user = await repo.findByUsername(username);
  if (!user) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

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
    { expiresIn: "1h" }
  );

  return {
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
    },
  };
}

module.exports = { createUser, loginUser };
