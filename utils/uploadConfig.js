const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("../utils/cloudinary");

// Memory storage (no local files)
const storage = multer.memoryStorage();

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
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ✅ Validate 2x2 picture (600x600)
async function validate2x2(req, res, next) {
  try {
    const file = req.files?.profilePic?.[0];
    if (!file) return next();

    const metadata = await sharp(file.buffer).metadata();

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

// ✅ Upload to Cloudinary directly from memory
async function uploadToCloudinary(fileBuffer, folder, mimetype) {
  const streamifier = require("streamifier");

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: mimetype.startsWith("image") ? "image" : "raw",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          fileName: result.public_id,
          filePath: result.secure_url,
          mimeType: result.format,
        });
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

// ✅ Handle multiple uploads
async function processUploadedDocs(files) {
  if (!files || Object.keys(files).length === 0) {
    throw new Error("At least one document (PDF or PNG) is required.");
  }

  const allFiles = Object.values(files).flat();
  const uploadedFiles = [];

  for (const file of allFiles) {
    const folder =
      file.fieldname === "profilePic"
        ? "VLSystem/userProfilePictures"
        : "VLSystem/documents";

    const uploaded = await uploadToCloudinary(file.buffer, folder, file.mimetype);
    uploadedFiles.push(uploaded);
  }

  return uploadedFiles;
}

module.exports = { upload, validate2x2, processUploadedDocs };
