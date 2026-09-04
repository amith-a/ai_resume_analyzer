import React, { useState, useEffect } from "react";
import {
  BrainCircuit,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Award,
  Sparkles,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { analyzeResume, ApiError } from "../services/api.client.js";
import type { ResumeAnalysis } from "../types/api.types.js";

interface AnalysisViewProps {
  documentId: string;
  initialAnalysis?: ResumeAnalysis | null;
  onAnalysisLoaded: (analysis: ResumeAnalysis) => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({
  documentId,
  initialAnalysis,
  onAnalysisLoaded,
}) => {
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(initialAnalysis || null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await analyzeResume(documentId);
      setAnalysis(data);
      onAnalysisLoaded(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to perform AI resume analysis.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!analysis && !isLoading && !errorMessage) {
      fetchAnalysis();
    }
  }, [documentId]);

  if (isLoading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <Loader2
          size={36}
          className="spinner"
          color="var(--primary)"
          style={{ margin: "0 auto 1.5rem" }}
        />
        <h3 style={{ color: "#fff", marginBottom: "0.5rem" }}>
          Analyzing Resume with Local LLM...
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Invoking Qwen via LangChain structured output schema to extract candidate qualifications.
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="card">
        <div className="alert alert-error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Analysis Failed: </strong> {errorMessage}
          </div>
        </div>
        <button onClick={fetchAnalysis} className="btn btn-primary">
          <RefreshCw size={16} />
          Retry Analysis
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <button onClick={fetchAnalysis} className="btn btn-primary">
          <BrainCircuit size={18} />
          Start Structured AI Analysis
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Candidate Overview Card */}
      <div className="card">
        <h2 className="card-title">
          <BrainCircuit size={20} color="var(--primary)" />
          Candidate Summary
        </h2>
        <p style={{ fontSize: "0.95rem", lineHeight: "1.7", color: "var(--text-primary)" }}>
          {analysis.candidateSummary}
        </p>
      </div>

      {/* Skills & Strengths Grid */}
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">
            <Sparkles size={18} color="var(--accent-cyan)" />
            Core Skills ({analysis.skills.length})
          </h3>
          <div className="tag-cloud">
            {analysis.skills.map((skill, idx) => (
              <span key={idx} className="badge badge-skill">
                {skill}
              </span>
            ))}
          </div>

          {analysis.technologies && analysis.technologies.length > 0 && (
            <div style={{ marginTop: "1.25rem" }}>
              <h4
                style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}
              >
                Technologies & Tools
              </h4>
              <div className="tag-cloud">
                {analysis.technologies.map((tech, idx) => (
                  <span
                    key={idx}
                    className="badge"
                    style={{
                      background: "rgba(6, 182, 212, 0.1)",
                      color: "#67e8f9",
                      border: "1px solid rgba(6, 182, 212, 0.25)",
                    }}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">
            <Award size={18} color="var(--accent-emerald)" />
            Key Strengths
          </h3>
          <ul
            style={{
              listStyleType: "none",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            {analysis.strengths.map((str, idx) => (
              <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <span style={{ color: "var(--accent-emerald)", fontWeight: "bold" }}>✓</span>
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{str}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Experience Timeline */}
      {analysis.experience && analysis.experience.length > 0 && (
        <div className="card">
          <h3 className="card-title">
            <Briefcase size={20} color="var(--primary)" />
            Professional Experience
          </h3>
          <div className="timeline" style={{ marginTop: "1.5rem" }}>
            {analysis.experience.map((exp, idx) => (
              <div key={idx} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-title">{exp.role}</div>
                <div className="timeline-meta">
                  <span style={{ color: "#c7d2fe", fontWeight: "500" }}>{exp.company}</span>
                  {exp.duration && <span> • {exp.duration}</span>}
                </div>
                {exp.description && <p className="timeline-body">{exp.description}</p>}
                {exp.highlights && exp.highlights.length > 0 && (
                  <ul
                    style={{
                      marginTop: "0.5rem",
                      paddingLeft: "1.2rem",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {exp.highlights.map((hl, hIdx) => (
                      <li key={hIdx} style={{ marginBottom: "0.25rem" }}>
                        {hl}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education & Projects Grid */}
      <div className="grid-2">
        {analysis.education && analysis.education.length > 0 && (
          <div className="card">
            <h3 className="card-title">
              <GraduationCap size={18} color="var(--accent-cyan)" />
              Education
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {analysis.education.map((edu, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--bg-surface)",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.9rem" }}>
                    {edu.degree}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {edu.institution} {edu.year ? `(${edu.year})` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.projects && analysis.projects.length > 0 && (
          <div className="card">
            <h3 className="card-title">
              <FolderGit2 size={18} color="var(--accent-amber)" />
              Notable Projects
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {analysis.projects.map((proj, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--bg-surface)",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.9rem" }}>
                    {proj.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.825rem",
                      color: "var(--text-secondary)",
                      marginTop: "0.2rem",
                    }}
                  >
                    {proj.description}
                  </div>
                  {proj.technologies && proj.technologies.length > 0 && (
                    <div className="tag-cloud" style={{ marginTop: "0.5rem" }}>
                      {proj.technologies.map((t, tIdx) => (
                        <span
                          key={tIdx}
                          className="badge"
                          style={{ background: "rgba(0,0,0,0.3)", fontSize: "0.7rem" }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Missing or Unclear Information Banner */}
      {analysis.missingOrUnclear && analysis.missingOrUnclear.length > 0 && (
        <div className="alert alert-warning">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
              Information Gaps or Ambiguities
            </div>
            <ul style={{ paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
              {analysis.missingOrUnclear.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
