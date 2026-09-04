import React from "react";
import { FileText, CheckCircle2 } from "lucide-react";
import type { UploadResumeData } from "../types/api.types.js";

interface NavbarProps {
  isBackendHealthy: boolean | null;
  activeResume: UploadResumeData | null;
  chunkCount: number | null;
  onClearActiveResume: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isBackendHealthy,
  activeResume,
  chunkCount,
  onClearActiveResume,
}) => {
  return (
    <header>
      <nav className="navbar">
        <a href="#" className="brand">
          <div className="brand-icon">
            <FileText size={22} />
          </div>
          <span className="brand-title">AI Resume Analyzer</span>
          <span className="brand-badge">LangChain + pgvector</span>
        </a>

        <div className="nav-actions">
          <div className="health-status">
            <span className={`status-dot ${isBackendHealthy === false ? "offline" : ""}`} />
            <span>
              {isBackendHealthy === null
                ? "Connecting..."
                : isBackendHealthy
                  ? "Backend Online"
                  : "Backend Offline"}
            </span>
          </div>
        </div>
      </nav>

      {activeResume && (
        <div className="active-resume-bar">
          <div className="active-resume-meta">
            <CheckCircle2 size={20} color="var(--accent-emerald)" />
            <div>
              <span className="active-resume-name">{activeResume.filename}</span>
              {chunkCount !== null && (
                <span
                  style={{
                    marginLeft: "0.75rem",
                    fontSize: "0.8rem",
                    color: "var(--accent-cyan)",
                  }}
                >
                  {chunkCount} chunks indexed
                </span>
              )}
            </div>
            <span className="active-resume-id">{activeResume.documentId.slice(0, 8)}...</span>
          </div>
          <button
            onClick={onClearActiveResume}
            className="btn btn-secondary btn-sm"
            title="Upload or switch to another resume"
          >
            Switch Resume
          </button>
        </div>
      )}
    </header>
  );
};
