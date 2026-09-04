/**
 * Shared Test Helpers & Canonical Test Fixtures
 * Strictly contains genuinely duplicated fixtures across test suites.
 */

// Authentic single-page minimal PDF containing extractable text
export const SAMPLE_PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 125 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Jane Doe - Senior Full Stack Engineer specializing in TypeScript, Node.js, PostgreSQL, and Cloud Architecture.) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n377\n%%EOF",
);

// Malformed PDF buffer missing xref and structure
export const CORRUPT_PDF_BUFFER = Buffer.from("%PDF-1.4\nCORRUPTED_BINARY_STREAM_NO_XREF\n%%EOF");

// Spoofed PNG header bytes
export const SPOOFED_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Creates a deterministic mock for globalThis.fetch targeting Ollama embedding and generation APIs.
 */
export function createMockOllamaFetch(customGenerateJson?: Record<string, unknown>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Handle Ollama embeddings
    if (
      url.includes("/api/embed") ||
      url.includes("/api/embeddings") ||
      (url.includes("11434") && url.includes("embed"))
    ) {
      const bodyStr = typeof init?.body === "string" ? init.body : "";
      try {
        const parsed = JSON.parse(bodyStr);
        if (Array.isArray(parsed.input)) {
          const embeddings = parsed.input.map(() => new Array(768).fill(0.01));
          return new Response(JSON.stringify({ embeddings }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        // pass
      }
      return new Response(JSON.stringify({ embedding: new Array(768).fill(0.01) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle Ollama generation / structured completion
    if (url.includes("/api/generate") || url.includes("/api/chat") || url.includes("11434")) {
      const responseData = customGenerateJson || {
        response: JSON.stringify({
          candidateSummary:
            "Experienced Senior Full Stack Engineer specializing in TypeScript and Node.js.",
          skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker", "AWS"],
          experience: [
            {
              role: "Senior Full Stack Engineer",
              company: "Tech Corp",
              duration: "2020 - Present",
              description: "Architected distributed cloud systems using Node.js.",
              highlights: ["Built microservices", "Improved latency by 40%"],
            },
          ],
          education: [
            {
              degree: "B.S. Computer Science",
              institution: "Tech University",
              year: "2018",
            },
          ],
          projects: [
            {
              name: "Cloud Pipeline",
              description: "Distributed message processing stream.",
              technologies: ["Node.js", "Kafka"],
            },
          ],
          technologies: ["Node.js", "TypeScript", "PostgreSQL", "Docker"],
          certifications: [],
          strengths: ["Strong backend architecture", "Deep TypeScript expertise"],
          missingOrUnclear: [],
        }),
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
