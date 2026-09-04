import React, { useState } from "react";
import { Search, Database, Loader2, AlertCircle, Layers } from "lucide-react";
import { searchChunks, ApiError } from "../services/api.client.js";
import type { ChunkSearchResult } from "../types/api.types.js";

interface SemanticSearchViewProps {
  activeDocumentId?: string;
}

export const SemanticSearchView: React.FC<SemanticSearchViewProps> = ({ activeDocumentId }) => {
  const [query, setQuery] = useState("");
  const [documentId, setDocumentId] = useState(activeDocumentId || "");
  const [topK, setTopK] = useState(5);
  const [maxDistanceThreshold, setMaxDistanceThreshold] = useState(0.5);
  const [results, setResults] = useState<ChunkSearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (activeDocumentId) {
      setDocumentId(activeDocumentId);
    }
  }, [activeDocumentId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    const cleanDocId = documentId.trim();

    if (!cleanQuery) return;
    if (!cleanDocId) {
      setErrorMessage("Document ID is required to perform scoped semantic chunk retrieval.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await searchChunks(cleanQuery, cleanDocId, topK, maxDistanceThreshold);
      setResults(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to perform semantic chunk search.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card">
        <h2 className="card-title">
          <Database size={20} color="var(--accent-cyan)" />
          Semantic Vector Chunk Explorer
        </h2>
        <p className="card-desc">
          Search indexed resume text directly via vector cosine distance in PostgreSQL/pgvector.
          This demonstrates direct retrieval without invoking the LLM.
        </p>

        {errorMessage && (
          <div className="alert alert-error">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSearch}>
          <div className="form-group">
            <label className="form-label" htmlFor="vector-doc-id">
              Target Document ID
            </label>
            <input
              id="vector-doc-id"
              type="text"
              className="form-input"
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required
            />
            {activeDocumentId && documentId === activeDocumentId && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--accent-emerald)",
                  marginTop: "0.25rem",
                  display: "inline-block",
                }}
              >
                ✓ Using active ingested resume
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="vector-query">
              Semantic Search Query
            </label>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                id="vector-query"
                type="text"
                className="form-input"
                placeholder="e.g. distributed systems, Docker pipelines, PostgreSQL performance..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !query.trim() || !documentId.trim()}
                style={{ padding: "0 1.5rem" }}
              >
                {isLoading ? <Loader2 size={18} className="spinner" /> : <Search size={18} />}
                Search
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "1.5rem",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              paddingTop: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>Max Distance:</span>
              <select
                className="form-input"
                style={{ width: "90px", padding: "0.3rem 0.6rem" }}
                value={maxDistanceThreshold}
                onChange={(e) => setMaxDistanceThreshold(Number(e.target.value))}
              >
                <option value={0.3}>0.3 (Strict)</option>
                <option value={0.4}>0.4</option>
                <option value={0.5}>0.5 (Default)</option>
                <option value={0.6}>0.6 (Loose)</option>
                <option value={0.8}>0.8 (Broad)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>Top-K Results:</span>
              <select
                className="form-input"
                style={{ width: "80px", padding: "0.3rem 0.6rem" }}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Search results */}
      {results && (
        <div className="card">
          <h3 className="card-title">
            <Layers size={18} color="var(--accent-cyan)" />
            Retrieved Chunks ({results.length})
          </h3>

          {results.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "1.5rem 0" }}>
              No chunks satisfied the similarity threshold for this query.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
            >
              {results.map((chunk) => {
                const similarityPct = Math.max(0, Math.round((1 - chunk.distance) * 100));
                return (
                  <div
                    key={chunk.id}
                    style={{
                      padding: "1rem",
                      background: "var(--bg-surface)",
                      borderRadius: "8px",
                      borderLeft: "3px solid var(--accent-cyan)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span className="source-badge">
                        Chunk #{chunk.chunk_index} (Doc: {chunk.document_id.slice(0, 8)}...)
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: "rgba(6, 182, 212, 0.15)",
                          color: "#67e8f9",
                        }}
                      >
                        Cosine Sim: {similarityPct}% (Dist: {chunk.distance.toFixed(3)})
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        lineHeight: "1.6",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {chunk.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
