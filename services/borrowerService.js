const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { decrypt } = require("../Utils/crypt");
const { generateBorrowerId } = require("../Utils/generator");
const { generateBorrowerUsername } = require("../Utils/username");
const otpStore = require("../Utils/otpStore");
const {BACKEND_URL} = require("../config");
const borrowerRepository = require("../Repositories/borrowerRepository");
const borrowerSchema = require("../schemas/borrowerSchema");

//Create borrower
async function createBorrower(data, db) {
  const repo = borrowerRepository(db);
  const { name, role, applicationId, assignedCollector } = data;

  if (!name || !role || !applicationId)
    throw new Error("Name, role, and applicationId are required");

  if (!name.trim().includes(" "))
    throw new Error("Please provide full name (first and last)");

  const application = await repo.findApplicationById(applicationId);
  if (!application) throw new Error("Application not found");

  // Generate unique username
  const username = await generateBorrowerUsername(
    name,
    db.collection("borrowers_account")
  );
  if (!username) throw new Error("Invalid full name");

  // Generate borrower ID
  const borrowersId = await generateBorrowerId(
    db.collection("borrowers_account")
  );

  // Default password
  const lastName = name.trim().split(" ").slice(-1)[0].toLowerCase();
  const birthDate = new Date(application.appDob);
  const formattedDate = `${birthDate.getFullYear()}${(birthDate.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${birthDate.getDate().toString().padStart(2, "0")}`;
  const defaultPassword = `${lastName}${formattedDate}`;
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const profilePicUrl = application.profilePic
  ? 
    application.profilePic.filePath
      ? application.profilePic.filePath.replace(/\\/g, "/")
      : application.profilePic
  : null;


  const borrower = borrowerSchema.parse({
    borrowersId,
    name,
    role,
    username,
    password: hashedPassword,
    isFirstLogin: true,
    assignedCollector,
    email: decrypt(application.appEmail),
    profilePic: profilePicUrl,
  });

  await repo.insertBorrower(borrower);
  await repo.updateApplicationWithBorrower(applicationId, borrowersId, username);

  return { borrower, tempPassword: defaultPassword };
}

//Login borrower
async function loginBorrower(username, password, db, jwtSecret) {
  if (!username || !password)
    throw new Error("Username and password are required");
  const repo = borrowerRepository(db);
  const borrower = await repo.findByUsername(username);
  if (!borrower) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, borrower.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { borrowersId: borrower.borrowersId, role: "borrower" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  return {
    message: "Login successful",
    name: borrower.name,
    username: decrypt(borrower.username),
    email: decrypt(borrower.email),
    role: "borrower",
    profilePic: borrower.profilePic || null,
    borrowersId: borrower.borrowersId,
    isFirstLogin: borrower.isFirstLogin !== false,
    passwordChanged: borrower.passwordChanged === true,
    token,
  };
}

//forgot password
async function forgotPassword(username, email, db) {
  if (!username || !email) throw new Error("Username and email are required");
  const repo = borrowerRepository(db);

  const borrower = await repo.findByUsernameAndEmail(username, email);
  if (!borrower)
    throw new Error("No account found with that username and email");

  return {
    message: "Borrower found",
    borrowersId: borrower.borrowersId,
    username: borrower.username,
    email: borrower.email,
  };
}

//Send otp
async function sendOtp(borrowersId, db) {
  if (!borrowersId) throw new Error("borrowersId is required");

  const repo = borrowerRepository(db);

  const borrower = await repo.findByBorrowersId(borrowersId);
  if (!borrower) throw new Error("Borrower not found");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[borrowersId] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  console.log(`OTP for ${borrower.email}: ${otp}`);

  return { message: "OTP sent to your email address" };
}

//Verify OTP
async function verifyOtp(borrowersId, otp) {
  if (!borrowersId || !otp) throw new Error("borrowersId and otp are required");

  const record = otpStore[borrowersId];
  if (!record) throw new Error("No OTP found");
  if (Date.now() > record.expires) throw new Error("OTP expired");
  if (record.otp !== otp) throw new Error("Invalid OTP");

  delete otpStore[borrowersId];

  return { message: "OTP verified successfully" };
}


async function getBorrowerById(borrowersId, db) {
  const repo = borrowerRepository(db);
  const borrower = await repo.findBorrowerById(borrowersId);
  if (!borrower) throw new Error("Borrower not found");

  const activeLoan = await repo.findActiveLoanByBorrowerId(borrowersId);

  const profilePicUrl = borrower.profilePic?.filePath
    ? `${BACKEND_URL}/${borrower.profilePic.filePath.replace(/\\/g, "/")}`
    : null;

  return {
    name: decrypt(borrower.name),
    username: decrypt(borrower.username),
    email: decrypt(borrower.email),
    role: "borrower",
    isFirstLogin: borrower.isFirstLogin !== false,
    borrowersId: borrower.borrowersId,
    profilePic: profilePicUrl,
    status: activeLoan ? "Active" : "Inactive",
  };
}

module.exports = {
  createBorrower,
  loginBorrower,
  forgotPassword,
  sendOtp,
  verifyOtp,
  getBorrowerById,
};
