import { describe, it, expect } from "vitest";
import { TriageOutputSchema } from "@/lib/ai/triageService";

// ── Valid baseline ────────────────────────────────────────────────────────────

const validOutput = {
  summary: "Patient requires urgent follow-up for elevated blood pressure readings.",
  priority: "High",
  tags: ["urgent_follow_up", "blood_pressure", "medication_review"],
  confidence: 87,
};

describe("TriageOutputSchema", () => {

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("accepts a fully valid output", () => {
    const result = TriageOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("accepts all four priority values", () => {
    for (const priority of ["Low", "Medium", "High", "Critical"]) {
      const result = TriageOutputSchema.safeParse({ ...validOutput, priority });
      expect(result.success).toBe(true);
    }
  });

  it("accepts exactly 3 tags (minimum)", () => {
    const result = TriageOutputSchema.safeParse({
      ...validOutput,
      tags: ["a", "b", "c"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 6 tags (maximum)", () => {
    const result = TriageOutputSchema.safeParse({
      ...validOutput,
      tags: ["a", "b", "c", "d", "e", "f"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts confidence of 0", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts confidence of 100", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: 100 });
    expect(result.success).toBe(true);
  });

  // ── Summary failures ────────────────────────────────────────────────────────

  it("rejects empty summary string", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, summary: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-string summary", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, summary: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects null summary", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, summary: null });
    expect(result.success).toBe(false);
  });

  // ── Priority failures ───────────────────────────────────────────────────────

  it("rejects unknown priority string", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, priority: "Urgent" });
    expect(result.success).toBe(false);
  });

  it("rejects lowercase priority", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, priority: "high" });
    expect(result.success).toBe(false);
  });

  it("rejects numeric priority", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, priority: 3 });
    expect(result.success).toBe(false);
  });

  // ── Tags failures ───────────────────────────────────────────────────────────

  it("rejects fewer than 3 tags", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, tags: ["a", "b"] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 6 tags", () => {
    const result = TriageOutputSchema.safeParse({
      ...validOutput,
      tags: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects tags with non-string elements", () => {
    const result = TriageOutputSchema.safeParse({
      ...validOutput,
      tags: ["a", 2, "c"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects tags as a plain string instead of array", () => {
    const result = TriageOutputSchema.safeParse({
      ...validOutput,
      tags: "urgent_follow_up",
    });
    expect(result.success).toBe(false);
  });

  // ── Confidence failures ─────────────────────────────────────────────────────

  it("rejects confidence below 0", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 100", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects float confidence", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: 87.5 });
    expect(result.success).toBe(false);
  });

  it("rejects string confidence", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: "87" });
    expect(result.success).toBe(false);
  });

  // ── Missing fields ──────────────────────────────────────────────────────────

  it("rejects missing summary", () => {
    const { summary: _, ...rest } = validOutput;
    const result = TriageOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing priority", () => {
    const { priority: _, ...rest } = validOutput;
    const result = TriageOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing tags", () => {
    const { tags: _, ...rest } = validOutput;
    const result = TriageOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing confidence", () => {
    const { confidence: _, ...rest } = validOutput;
    const result = TriageOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects completely empty object", () => {
    const result = TriageOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // ── Error message quality ───────────────────────────────────────────────────

  it("returns a readable error message for wrong priority", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, priority: "Urgent" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBeTruthy();
    }
  });

  it("returns a readable error for confidence out of range", () => {
    const result = TriageOutputSchema.safeParse({ ...validOutput, confidence: 150 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
