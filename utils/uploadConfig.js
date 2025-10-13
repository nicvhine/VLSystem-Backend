const multer = require("multer");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");

// Ensure base uploads directory exists
const baseDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

// ensure subfolder exists
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder;

    if (file.fieldname === "documents") {
      subfolder = "documents";
    } else if (file.fieldname === "profilePic") {
      subfolder = "userProfilePictures";
    } else {
      subfolder = "others";
    }

    const uploadPath = path.join(baseDir, subfolder);
    ensureDirExists(uploadPath);
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    const borrowerId =
      req.body.borrowersId ||
      req.params.borrowersId ||
      req.body.applicationId ||
      req.params.applicationId ||
      "GEN"; 

    const uniqueName = `${borrowerId}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedDocs = ["application/pdf", "image/png"];
  const allowedPp = ["image/jpeg", "image/png"];

  if (file.fieldname === "documents") {
    if (allowedDocs.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF and PNG allowed for documents"), false);
  } else if (file.fieldname === "profilePic") {
    if (allowedPp.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG or PNG allowed for profile picture"), false);
  } else {
    cb(new Error("Unknown file field"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

async function validate2x2(req, res, next) {
  try {
    const file = req.files?.profilePic?.[0];
    if (!file) return next();

    const metadata = await sharp(file.path).metadata();

    if (metadata.width !== 600 || metadata.height !== 600) {
      return res.status(400).json({
        error: "Profile picture must be 2x2 inches (600x600 pixels).",
      });
    }

    next();
  } catch (err) {
    console.error("Error validating profile picture:", err.message);
    res.status(500).json({ error: "Failed to validate profile picture." });
  }
}

function processUploadedDocs(files) {
  if (!files || Object.keys(files).length === 0) {
    throw new Error("At least one document (PDF or PNG) is required.");
  }

  const allFiles = Object.values(files).flat();
  return allFiles.map((file) => ({
    fileName: file.originalname,
    filePath: file.path,
    mimeType: file.mimetype,
  }));
}

module.exports = { upload, validate2x2, processUploadedDocs };
