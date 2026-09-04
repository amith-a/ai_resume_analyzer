import React, { useState } from "react";
import { MessageSquare, Send, Sparkles, AlertCircle, Loader2, Database } from "lucide-react";
import { askResumeQuestion, ApiError } from "../services/api.client.js";
import type { RagSource } from "../types/api.types.js";

interface RagChatViewProps {
  documentId: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: RagSource[];
  timestamp: string;
}

const EXAMPLE_QUESTIONS = [
  "What are this candidate's strongest technical skills?",
  "How many years of backend development experience are documented?",
  "Does the candidate have experience with PostgreSQL or databases?",
  "What degrees and educational institutions are mentioned?",
];

export const RagChatView: React.FC<RagChatViewProps> = ({ documentId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "I am ready to answer questions about this candidate. All answers are strictly grounded in retrieved evidence from the candidate's resume.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSend = async (queryToSend?: string) => {
    const query = (queryToSend || question).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await askResumeQuestion(documentId, query);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "assistant",
        text: response.answer,
        sources: response.sources,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to generate grounded answer.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "700px" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h2 className="card-title">
          <MessageSquare size={20} color="var(--primary)" />
          Grounded Resume Q&A (RAG)
        </h2>
        <p className="card-desc" style={{ marginBottom: "0.5rem" }}>
          Inquire about specific details in the candidate's background. Answers cite pgvector source
          chunks and will indicate if information is not found in the resume.
        </p>

        {/* Quick prompt suggestions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
          {EXAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              disabled={isLoading}
              onClick={() => handleSend(q)}
            >
              <Sparkles size={12} color="var(--accent-cyan)" />
              {q}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Message history container */}
      <div className="chat-messages" style={{ flex: 1 }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.sender}`}>
            <p>{msg.text}</p>

            {msg.sources && msg.sources.length > 0 && (
              <div className="source-citation">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.4rem",
                    fontSize: "0.75rem",
                  }}
                >
                  <Database size={13} />
                  Cited Evidence Chunks:
                </div>
                <div>
                  {msg.sources.map((s, idx) => (
                    <span
                      key={idx}
                      className="source-badge"
                      title={s.content.slice(0, 200) + "..."}
                    >
                      Chunk #{s.chunkIndex} (Doc: {s.documentId.slice(0, 8)}...)
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: "0.7rem",
                color: msg.sender === "user" ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
                textAlign: "right",
                marginTop: "0.4rem",
              }}
            >
              {msg.timestamp}
            </div>
          </div>
        ))}

        {isLoading && (
          <div
            className="chat-bubble assistant"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Loader2 size={16} className="spinner" color="var(--primary)" />
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Retrieving context & synthesizing grounded answer...
            </span>
          </div>
        )}
      </div>

      {/* Input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}
      >
        <input
          type="text"
          className="form-input"
          placeholder="Ask a question about this candidate..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || !question.trim()}
          style={{ padding: "0 1.25rem" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};
