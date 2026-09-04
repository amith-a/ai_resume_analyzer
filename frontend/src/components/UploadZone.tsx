import React, { useState, useRef } from "react";
import { UploadCloud, FileType, Loader2, AlertTriangle } from "lucide-react";
import { uploadResume, ApiError } from "../services/api.client.js";
import type { UploadResumeData } from "../types/api.types.js";

interface UploadZoneProps {
  onUploadSuccess: (data: UploadResumeData) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const UploadZone: React.FC<UploadZoneProps> = ({ onUploadSuccess }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    setErrorMessage(null);
    const validExtensions = [".pdf", ".docx"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      setErrorMessage("Only PDF (.pdf) and Word (.docx) documents are supported.");
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("File exceeds the 5 MB limit. Please select a smaller resume.");
      return false;
    }

    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await uploadResume(selectedFile);
      onUploadSuccess(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected error occurred during document upload.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: "680px", margin: "0 auto" }}>
      <h2 className="card-title">
        <UploadCloud size={22} color="var(--primary)" />
        Upload Candidate Resume
      </h2>
      <p className="card-desc">
        Upload a PDF or Word resume. The backend extracts text, parses sections, generates
        embeddings via Ollama, and indexes chunks into pgvector.
      </p>

      {errorMessage && (
        <div className="alert alert-error">
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          className={`dropzone ${dragOver ? "dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
          />

          <FileType className="dropzone-icon" />

          {selectedFile ? (
            <div>
              <p className="dropzone-title">{selectedFile.name}</p>
              <p className="dropzone-hint">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to ingest
              </p>
            </div>
          ) : (
            <div>
              <p className="dropzone-title">Click to upload or drag & drop</p>
              <p className="dropzone-hint">PDF or DOCX documents up to 5 MB</p>
            </div>
          )}
        </div>

        {selectedFile && (
          <div style={{ marginTop: "1.5rem" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="resume-title">
                Candidate Name or Resume Title
              </label>
              <input
                id="resume-title"
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. John Doe - Full Stack Engineer"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  Ingesting, Chunking & Embedding...
                </>
              ) : (
                <>
                  <UploadCloud size={18} />
                  Ingest & Process Resume
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
