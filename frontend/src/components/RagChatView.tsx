import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  AlertCircle,
  Loader2,
  Database,
  User,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  "What are this candidate's strongest skills?",
  "How many years of backend experience?",
  "Does the candidate know PostgreSQL or databases?",
  "What degrees and institutions are listed?",
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
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const toggleSource = (sourceKey: string) => {
    setExpandedSourceId((prev) => (prev === sourceKey ? null : sourceKey));
  };

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
    <div className="card chat-card">
      <div className="chat-header">
        <div className="chat-header-title">
          <h2 className="card-title" style={{ margin: 0 }}>
            <MessageSquare size={19} color="var(--primary)" />
            Grounded Resume Q&A (RAG)
          </h2>
          <span className="badge" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#a5b4fc", fontSize: "0.7rem" }}>
            pgvector
          </span>
        </div>
        <p className="card-desc" style={{ marginTop: "0.4rem", marginBottom: "0.25rem" }}>
          Inquire about specific details. Answers cite pgvector source chunks and decline if not found.
        </p>

        {/* Quick prompt suggestions - Horizontal scroll on mobile */}
        <div className="chat-suggestions-tray">
          {EXAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              className="suggestion-chip"
              disabled={isLoading}
              onClick={() => handleSend(q)}
            >
              <Sparkles size={11} color="var(--accent-cyan)" />
              <span>{q}</span>
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Message history container */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message-row ${msg.sender}`}>
            {msg.sender === "assistant" && (
              <div className="chat-avatar assistant">
                <Bot size={16} />
              </div>
            )}

            <div className={`chat-bubble ${msg.sender}`}>
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
                    <Database size={12} />
                    <span>Cited Evidence Chunks:</span>
                  </div>
                  <div>
                    {msg.sources.map((s, idx) => {
                      const sourceKey = `${msg.id}-${idx}`;
                      const isExpanded = expandedSourceId === sourceKey;
                      return (
                        <div key={idx} style={{ marginBottom: "0.25rem" }}>
                          <button
                            type="button"
                            className="source-badge"
                            onClick={() => toggleSource(sourceKey)}
                            title="Tap to preview cited chunk"
                          >
                            <span>Chunk #{s.chunkIndex}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          {isExpanded && (
                            <div className="source-excerpt">
                              "{s.content}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                style={{
                  fontSize: "0.68rem",
                  color: msg.sender === "user" ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
                  textAlign: "right",
                  marginTop: "0.35rem",
                }}
              >
                {msg.timestamp}
              </div>
            </div>

            {msg.sender === "user" && (
              <div className="chat-avatar user">
                <User size={15} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="chat-message-row assistant">
            <div className="chat-avatar assistant">
              <Bot size={16} />
            </div>
            <div
              className="chat-bubble assistant"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Loader2 size={16} className="spinner" color="var(--primary)" />
              <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Retrieving chunks & synthesizing answer...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="chat-input-form"
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
          title="Send Question"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
};
