import { fileTypeFromBuffer } from "file-type";

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export interface FileValidationResult {
  isValid: boolean;
  detectedMime: string | null;
  detectedExt: string | null;
  error?: string;
}

export async function validateResumeBuffer(
  buffer: Buffer
): Promise<FileValidationResult> {
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      detectedMime: null,
      detectedExt: null,
      error: "Uploaded file buffer is empty",
    };
  }

  const result = await fileTypeFromBuffer(buffer);

  if (!result) {
    return {
      isValid: false,
      detectedMime: null,
      detectedExt: null,
      error: "Unsupported or unidentifiable file type. Only genuine PDF and DOCX files are allowed.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(result.mime)) {
    return {
      isValid: false,
      detectedMime: result.mime,
      detectedExt: result.ext,
      error: `Unsupported file type '${result.mime}'. Only genuine PDF and DOCX files are allowed.`,
    };
  }

  return {
    isValid: true,
    detectedMime: result.mime,
    detectedExt: result.ext,
  };
}
