import React, { useState } from "react";
import {
  GitCompare,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";
import { compareJob, ApiError } from "../services/api.client.js";
import type { JobComparison, OverallFit } from "../types/api.types.js";

interface JobComparisonViewProps {
  documentId: string;
}

const SAMPLE_JOB_DESCRIPTIONS = [
  {
    title: "Senior Full-Stack Engineer (Node.js / React)",
    text: `Role: Senior Full-Stack Engineer
Requirements:
- 5+ years building scalable web applications with Node.js and TypeScript.
- Hands-on experience with PostgreSQL, relational database modeling, and ORM/query tooling.
- Proficiency with modern frontend technologies: React, TypeScript, and state management.
- Experience with containerization (Docker, Docker Compose) and CI/CD pipelines.
- Knowledge of cloud platforms, microservices or modular monolith architecture.
- Strong problem-solving, code review, and mentoring abilities.`,
  },
  {
    title: "Backend AI / RAG Engineer",
    text: `Role: AI Systems Engineer (Embeddings & RAG)
Requirements:
- Strong background in Node.js/TypeScript backend engineering.
- Experience integrating LLMs (Ollama, OpenAI, LangChain) for extraction and question-answering.
- Deep understanding of vector databases, embeddings, and similarity search (pgvector, cosine distance).
- Experience with RAG pipelines: chunking strategies, prompt engineering, context limiting, and grounding.
- Solid understanding of asynchronous architectures, error boundaries, and telemetry/logging (Pino).`,
  },
];

export const JobComparisonView: React.FC<JobComparisonViewProps> = ({ documentId }) => {
  const [jobDescription, setJobDescription] = useState("");
  const [comparison, setComparison] = useState<JobComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDescription.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await compareJob(documentId, jobDescription);
      setComparison(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to perform job comparison.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getFitBadge = (fit: OverallFit) => {
    switch (fit) {
      case "strong":
        return <span className="badge badge-strong">Strong Match</span>;
      case "moderate":
        return <span className="badge badge-moderate">Moderate Match</span>;
      case "weak":
        return <span className="badge badge-weak">Weak Match</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card">
        <h2 className="card-title">
          <GitCompare size={20} color="var(--primary)" />
          Job Description Alignment & Gap Analysis
        </h2>
        <p className="card-desc">
          Paste a target job specification. The backend retrieves the most relevant candidate resume
          chunks, evaluates skill alignment, identifies gaps, and produces an objective fit
          assessment.
        </p>

        {errorMessage && (
          <div className="alert alert-error">
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleCompare}>
          <div className="form-group">
            <div
              style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}
            >
              <label className="form-label" htmlFor="job-description">
                Job Description
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {SAMPLE_JOB_DESCRIPTIONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                    onClick={() => setJobDescription(preset.text)}
                  >
                    Sample {idx + 1}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="job-description"
              className="form-textarea"
              rows={6}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste job requirements, responsibilities, or technical criteria here..."
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || !jobDescription.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spinner" />
                Comparing with Resume Evidence...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Analyze Alignment & Gaps
              </>
            )}
          </button>
        </form>
      </div>

      {comparison && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Fit Assessment Banner */}
          <div
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(90deg, rgba(17, 23, 38, 0.9), rgba(26, 34, 56, 0.8))",
            }}
          >
            <div>
              <h3 style={{ color: "#fff", fontSize: "1.1rem", marginBottom: "0.2rem" }}>
                Overall Candidate Fit
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Evaluated based on grounded resume evidence matched against job criteria.
              </p>
            </div>
            <div>{getFitBadge(comparison.overallFit)}</div>
          </div>

          {/* Matched vs Missing Skills */}
          <div className="grid-2">
            <div className="card">
              <h3 className="card-title">
                <CheckCircle size={18} color="var(--accent-emerald)" />
                Matched Skills ({comparison.matchedSkills.length})
              </h3>
              <div className="tag-cloud">
                {comparison.matchedSkills.length > 0 ? (
                  comparison.matchedSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{
                        background: "var(--accent-emerald-bg)",
                        color: "var(--accent-emerald)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                      }}
                    >
                      ✓ {skill}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No direct skill matches identified.
                  </span>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">
                <XCircle size={18} color="var(--accent-rose)" />
                Missing / Unfulfilled Skills ({comparison.missingSkills.length})
              </h3>
              <div className="tag-cloud">
                {comparison.missingSkills.length > 0 ? (
                  comparison.missingSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{
                        background: "var(--accent-rose-bg)",
                        color: "var(--accent-rose)",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                      }}
                    >
                      ✕ {skill}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--accent-emerald)", fontSize: "0.85rem" }}>
                    All required skills appear covered!
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Experience Alignment & Gaps */}
          <div className="grid-2">
            <div className="card">
              <h3 className="card-title">
                <Sparkles size={18} color="var(--primary)" />
                Relevant Experience
              </h3>
              <ul
                style={{
                  listStyleType: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {comparison.relevantExperience.map((item, idx) => (
                  <li
                    key={idx}
                    style={{
                      padding: "0.6rem 0.75rem",
                      background: "var(--bg-surface)",
                      borderRadius: "6px",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.875rem" }}>
                      {item.role} {item.company ? `• ${item.company}` : ""}{" "}
                      {item.years ? `(${item.years} yrs)` : ""}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.2rem",
                      }}
                    >
                      {item.relevance}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3 className="card-title">
                <AlertTriangle size={18} color="var(--accent-amber)" />
                Experience Gaps
              </h3>
              <ul
                style={{
                  listStyleType: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {comparison.experienceGaps.length > 0 ? (
                  comparison.experienceGaps.map((item, idx) => (
                    <li
                      key={idx}
                      style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}
                    >
                      <span style={{ color: "var(--accent-amber)", fontWeight: "bold" }}>•</span>
                      <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                        {item}
                      </span>
                    </li>
                  ))
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No significant experience gaps identified.
                  </span>
                )}
              </ul>
            </div>
          </div>

          {/* Relevant Projects */}
          {comparison.relevantProjects && comparison.relevantProjects.length > 0 && (
            <div className="card">
              <h3 className="card-title">
                <Sparkles size={18} color="var(--accent-cyan)" />
                Relevant Candidate Projects
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                {comparison.relevantProjects.map((proj, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "0.75rem 1rem",
                      background: "var(--bg-surface)",
                      borderRadius: "8px",
                      borderLeft: "3px solid var(--accent-cyan)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.9rem" }}>
                      {proj.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.825rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.25rem",
                      }}
                    >
                      {proj.relevance}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvement Recommendations */}
          {comparison.improvementSuggestions.length > 0 && (
            <div className="card">
              <h3 className="card-title">
                <Lightbulb size={18} color="var(--accent-amber)" />
                Actionable Recommendations for Alignment
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                {comparison.improvementSuggestions.map((rec, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "0.75rem 1rem",
                      background: "rgba(245, 158, 11, 0.08)",
                      borderLeft: "3px solid var(--accent-amber)",
                      borderRadius: "0 8px 8px 0",
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
