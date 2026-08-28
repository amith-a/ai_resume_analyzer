import multer from "multer";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

export const uploadResumeFile = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
}).single("file");
