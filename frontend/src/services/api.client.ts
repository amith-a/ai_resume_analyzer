import type {
  UploadResumeResponse,
  UploadResumeData,
  AnalyzeResumeResponse,
  ResumeAnalysis,
  JobComparisonResponse,
  JobComparison,
  RagAnswerResponse,
  RagAnswerData,
  SearchChunksResponse,
  ChunkSearchResult,
  HealthCheckResponse,
  ApiErrorResponse,
} from "../types/api.types.js";

export class ApiError extends Error {
  public statusCode: number;
  public errorType?: string;
  public issues?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    statusCode: number,
    errorType?: string,
    issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.issues = issues;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const errData = (await response.json()) as ApiErrorResponse;
      throw new ApiError(
        errData.message || `Request failed with HTTP ${response.status}`,
        response.status,
        errData.errorType,
        errData.issues,
      );
    }
    const text = await response.text();
    throw new ApiError(text || `Request failed with HTTP ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

/**
 * Upload and index a resume (PDF or DOCX <= 5 MB).
 * Multer field must strictly be "file".
 */
export async function uploadResume(file: File): Promise<UploadResumeData> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/resumes", {
    method: "POST",
    body: formData,
  });

  const body = await handleResponse<UploadResumeResponse>(response);
  return body.data;
}

/**
 * Trigger structured AI analysis for an ingested resume document.
 */
export async function analyzeResume(documentId: string): Promise<ResumeAnalysis> {
  const response = await fetch("/resumes/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });

  const body = await handleResponse<AnalyzeResumeResponse>(response);
  return body.data;
}

/**
 * Compare an ingested resume document against a job description.
 */
export async function compareJob(
  documentId: string,
  jobDescription: string,
): Promise<JobComparison> {
  const response = await fetch("/jobs/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, jobDescription }),
  });

  const body = await handleResponse<JobComparisonResponse>(response);
  return body.data;
}

/**
 * Ask a grounded question about a specific ingested resume using RAG.
 * Payload body requires `query` (not `question`).
 */
export async function askResumeQuestion(
  documentId: string,
  query: string,
  topK = 5,
  maxDistanceThreshold?: number,
): Promise<RagAnswerData> {
  const response = await fetch(`/resumes/${encodeURIComponent(documentId)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      topK,
      ...(maxDistanceThreshold !== undefined ? { maxDistanceThreshold } : {}),
    }),
  });

  const body = await handleResponse<RagAnswerResponse>(response);
  return body.data;
}

/**
 * Perform semantic search across indexed document chunks using pgvector cosine distance.
 * Backend requires a non-empty `documentId` in `RetrieveChunksRequestSchema`.
 */
export async function searchChunks(
  query: string,
  documentId: string,
  topK = 5,
  maxDistanceThreshold = 0.5,
): Promise<ChunkSearchResult[]> {
  const response = await fetch("/search/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      documentId,
      topK,
      maxDistanceThreshold,
    }),
  });

  const body = await handleResponse<SearchChunksResponse>(response);
  return body.chunks;
}

/**
 * Check backend liveness and availability.
 */
export async function checkHealth(): Promise<HealthCheckResponse> {
  const response = await fetch("/health");
  return handleResponse<HealthCheckResponse>(response);
}
