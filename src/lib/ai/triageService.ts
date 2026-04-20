import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { TriageResult } from "@/types/triage";

const client = new Anthropic();

export const PROMPT_VERSION = "triage-v1.1"; // bumped: added streaming + zod
export const MODEL = "claude-sonnet-4-20250514";

const MAX_NOTE_LENGTH = 4000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

// ── Zod schema ────────────────────────────────────────────────────────────────
// Single source of truth for what the AI must return.
// Any field mismatch is caught here before anything touches the DB or UI.
export const TriageOutputSchema = z.object({
  summary: z.string().min(1, "Summary must not be empty"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  tags: z
    .array(z.string())
    .min(3, "At least 3 tags required")
    .max(6, "At most 6 tags allowed"),
  confidence: z
    .number()
    .int("Confidence must be an integer")
    .min(0)
    .max(100),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a clinical case triage assistant for a healthcare admin platform.
Analyze the provided case note and return a JSON object with exactly these fields:
- summary: a concise 1-2 sentence summary of the case
- priority: one of "Low", "Medium", "High", or "Critical"
- tags: an array of 3-6 snake_case tags (e.g. "urgent_follow_up", "documentation_missing")
- confidence: an integer from 0 to 100 representing your confidence in this triage

Respond ONLY with valid JSON. No explanation, no markdown, no code fences.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  // Only retry on network/timeout/rate-limit errors — never on validation failures
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Core AI call with retry ───────────────────────────────────────────────────

async function callWithRetry(noteText: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 500ms, 1000ms
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[triageService] Retry attempt ${attempt} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Case note:\n\n${noteText}` }],
      });

      const block = response.content[0];
      if (block.type !== "text") throw new Error("Unexpected non-text block from model");
      return block.text;
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) break; // Don't retry on non-retryable errors
    }
  }

  throw lastError;
}

// ── Streaming variant ─────────────────────────────────────────────────────────
// Returns a ReadableStream of raw text chunks. The route pipes this directly
// to the HTTP response so the UI can render progressively.
// Validation still runs on the complete accumulated text before the stream closes.

export async function analyzeCaseStream(
  noteText: string,
  caseId: string,
  onComplete: (result: TriageResult) => Promise<void>
): Promise<ReadableStream<Uint8Array>> {
  if (!noteText?.trim()) throw new Error("Note text is empty or missing");
  const truncated = noteText.slice(0, MAX_NOTE_LENGTH);

  const encoder = new TextEncoder();
  let accumulated = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: MODEL,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Case note:\n\n${truncated}` }],
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            accumulated += chunk.delta.text;
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }

        // Validate the complete response before signalling done
        const result = parseAndValidate(accumulated, caseId);

        // Persist asynchronously — non-fatal if it fails
        onComplete(result).catch((err) =>
          console.error("[triageService] Stream persist failed:", err)
        );

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return stream;
}

// ── Non-streaming variant (kept for internal/batch use) ───────────────────────

export async function analyzeCase(
  noteText: string,
  caseId: string
): Promise<TriageResult> {
  if (!noteText?.trim()) throw new Error("Note text is empty or missing");
  const truncated = noteText.slice(0, MAX_NOTE_LENGTH);

  let rawText: string;
  try {
    rawText = await callWithRetry(truncated);
  } catch (err) {
    console.error("[triageService] AI call failed after retries:", err);
    throw new Error("AI service unavailable or returned invalid output");
  }

  return parseAndValidate(rawText, caseId);
}

// ── Parse + Zod validate ──────────────────────────────────────────────────────

function parseAndValidate(rawText: string, caseId: string): TriageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("AI returned non-JSON output");
  }

  // Zod validates and narrows the type in one step
  const result = TriageOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(`AI output validation failed: ${issues}`);
  }

  return {
    caseId,
    ...result.data,
    modelUsed: MODEL,
    promptVersion: PROMPT_VERSION,
    createdAt: new Date().toISOString(),
  };
}
