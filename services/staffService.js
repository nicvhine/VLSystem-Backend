const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { padId } = require("../utils/generator");
const { generateStaffUsername } = require("../utils/username")

const JWT_SECRET = process.env.JWT_SECRET;

// Create a staff user and return temp password
async function createUser({ name, email, phoneNumber, role }, actor, repo) {
  if (!name || !email || !phoneNumber || !role)
    throw new Error("All fields are required.");

  if (!name.trim().includes(" "))
    throw new Error("Please enter a full name with first and last name.");

  const username = await generateStaffUsername(name, role, repo);
  if (!username) throw new Error("Cannot generate username.");

  // Uniqueness checks
  const emailExists = await repo.findByEmail(email);
  if (emailExists) throw new Error("Email already registered.");

  const phoneExists = await repo.findByPhoneNumber(phoneNumber);
  if (phoneExists) throw new Error("Phone number already registered.");

  const nameExists = await repo.findByName(name.trim());
  if (nameExists) throw new Error("Name already registered.");

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
    status: "Active",
  };

  await repo.insertUser(newUser);

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
