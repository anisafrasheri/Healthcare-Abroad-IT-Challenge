export type Priority = "Low" | "Medium" | "High" | "Critical";

export interface TriageResult {
  caseId: string;
  summary: string;
  priority: Priority;
  tags: string[];
  confidence: number;       // 0-100, integer
  modelUsed: string;
  promptVersion: string;
  createdAt: string;        // ISO 8601
}

// Raw shape returned by the AI before validation.
// All fields are unknown — we never trust the model's output directly.
export interface RawAITriageOutput {
  summary: unknown;
  priority: unknown;
  tags: unknown;
  confidence: unknown;
}
