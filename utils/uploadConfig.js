const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("./cloudinary");

// Memory storage for direct Cloudinary upload
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

async function uploadToCloudinary(file, folder = "VLSystem/uploads", options = {}) {
  const { userId, applicationId } = options;
  const base64String = file.buffer.toString("base64");
  const dataUri = `data:${file.mimetype};base64,${base64String}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "auto",
    use_filename: false,
    unique_filename: false,
    public_id: applicationId || userId
  });

  return {
    fileName: result.public_id,
    filePath: result.secure_url,
    mimeType: result.format,  
    folder
  };
}


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

async function processUploadedDocs(files) {
  const allFiles = Object.values(files).flat();

  const uploadPromises = allFiles.map(async (file) => {
    const folder =
      file.fieldname === "profilePic"
        ? "VLSystem/userProfilePictures"
        : "VLSystem/documents";

    const uploaded = await uploadToCloudinary(file, folder);
    return uploaded;
  });

  const uploadedFiles = await Promise.all(uploadPromises);
  return uploadedFiles;
}


module.exports = { upload, validate2x2, processUploadedDocs };
