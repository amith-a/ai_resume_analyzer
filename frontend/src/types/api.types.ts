export interface UploadResumeData {
  documentId: string;
  filename: string;
  size: number;
  detectedMime: string;
  detectedExt: string;
  characterCount: number;
  pageCount?: number;
  chunkCount: number;
  text: string;
}

export interface UploadResumeResponse {
  status: "success";
  message: string;
  data: UploadResumeData;
}

export interface ExperienceItem {
  role: string;
  company: string;
  duration?: string;
  description?: string;
  highlights?: string[];
}

export interface EducationItem {
  degree: string;
  institution: string;
  year?: string;
  details?: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies?: string[];
}

export interface ResumeAnalysis {
  candidateSummary: string;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  technologies: string[];
  certifications: string[];
  strengths: string[];
  missingOrUnclear: string[];
}

export interface AnalyzeResumeResponse {
  status: "success";
  message: string;
  data: ResumeAnalysis;
}

export type OverallFit = "strong" | "moderate" | "weak";

export interface RelevantExperience {
  role: string;
  company?: string;
  years?: number;
  relevance: string;
}

export interface RelevantProject {
  name: string;
  relevance: string;
}

export interface JobComparison {
  matchedSkills: string[];
  missingSkills: string[];
  relevantExperience: RelevantExperience[];
  experienceGaps: string[];
  relevantProjects: RelevantProject[];
  strengths: string[];
  gaps: string[];
  improvementSuggestions: string[];
  overallFit: OverallFit;
}

export interface JobComparisonResponse {
  status: "success";
  message: string;
  data: JobComparison;
}

export interface RagSource {
  id: string;
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

export interface RagAnswerData {
  answer: string;
  sources: RagSource[];
}

export interface RagAnswerResponse {
  status: "success";
  data: RagAnswerData;
}

export interface ChunkSearchResult {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
}

export interface SearchChunksResponse {
  chunks: ChunkSearchResult[];
}

export interface HealthCheckResponse {
  status: string;
  timestamp?: string;
}

export interface ApiErrorResponse {
  status: "error";
  message: string;
  errorType?: string;
  statusCode?: number;
  issues?: Array<{ path: string; message: string }>;
}
