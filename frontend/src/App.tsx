import React, { useState, useEffect } from "react";
import { UploadCloud, BrainCircuit, GitCompare, MessageSquare, Database } from "lucide-react";
import { Navbar } from "./components/Navbar.js";
import { UploadZone } from "./components/UploadZone.js";
import { AnalysisView } from "./components/AnalysisView.js";
import { JobComparisonView } from "./components/JobComparisonView.js";
import { RagChatView } from "./components/RagChatView.js";
import { SemanticSearchView } from "./components/SemanticSearchView.js";
import { checkHealth } from "./services/api.client.js";
import type { UploadResumeData, ResumeAnalysis } from "./types/api.types.js";

type ActiveTab = "upload" | "analysis" | "compare" | "chat" | "search";

export const App: React.FC = () => {
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);
  const [activeResume, setActiveResume] = useState<UploadResumeData | null>(null);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("upload");

  // Check backend health periodically
  useEffect(() => {
    let mounted = true;

    const pollHealth = async () => {
      try {
        const res = await checkHealth();
        if (mounted) {
          setIsBackendHealthy(res.status === "ok");
        }
      } catch {
        if (mounted) {
          setIsBackendHealthy(false);
        }
      }
    };

    pollHealth();
    const interval = setInterval(pollHealth, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleUploadSuccess = (data: UploadResumeData) => {
    setActiveResume(data);
    setChunkCount(data.chunkCount);
    setAnalysis(null);
    setActiveTab("analysis");
  };

  const handleClearActiveResume = () => {
    setActiveResume(null);
    setChunkCount(null);
    setAnalysis(null);
    setActiveTab("upload");
  };

  return (
    <div className="app-container">
      <Navbar
        isBackendHealthy={isBackendHealthy}
        activeResume={activeResume}
        chunkCount={chunkCount}
        onClearActiveResume={handleClearActiveResume}
      />

      {/* Navigation Tabs Header */}
      <div className="tabs-header">
        <button
          className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          <UploadCloud size={17} />
          <span>Upload & Ingest</span>
        </button>

        <button
          className={`tab-btn ${activeTab === "analysis" ? "active" : ""}`}
          disabled={!activeResume}
          onClick={() => setActiveTab("analysis")}
        >
          <BrainCircuit size={17} />
          <span>Structured Analysis</span>
        </button>

        <button
          className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
          disabled={!activeResume}
          onClick={() => setActiveTab("compare")}
        >
          <GitCompare size={17} />
          <span>Job Description Match</span>
        </button>

        <button
          className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
          disabled={!activeResume}
          onClick={() => setActiveTab("chat")}
        >
          <MessageSquare size={17} />
          <span>Grounded Q&A (RAG)</span>
        </button>

        <button
          className={`tab-btn ${activeTab === "search" ? "active" : ""}`}
          onClick={() => setActiveTab("search")}
        >
          <Database size={17} />
          <span>Semantic Explorer</span>
        </button>
      </div>

      {/* Tab Panels */}
      <main>
        {activeTab === "upload" && <UploadZone onUploadSuccess={handleUploadSuccess} />}

        {activeTab === "analysis" && activeResume && (
          <AnalysisView
            documentId={activeResume.documentId}
            initialAnalysis={analysis}
            onAnalysisLoaded={setAnalysis}
          />
        )}

        {activeTab === "compare" && activeResume && (
          <JobComparisonView documentId={activeResume.documentId} />
        )}

        {activeTab === "chat" && activeResume && (
          <RagChatView documentId={activeResume.documentId} />
        )}

        {activeTab === "search" && (
          <SemanticSearchView activeDocumentId={activeResume?.documentId} />
        )}
      </main>

      <footer
        style={{
          marginTop: "4rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--border-subtle)",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <p>AI Resume Analyzer • Node.js • LangChain • Ollama Qwen • PostgreSQL + pgvector</p>
      </footer>
    </div>
  );
};
