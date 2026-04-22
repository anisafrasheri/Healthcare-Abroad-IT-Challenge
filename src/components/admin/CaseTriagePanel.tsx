"use client";

import { useState } from "react";
import { TriageResult } from "@/types/triage";

interface Props {
  caseId: string;
  noteText: string;
}

type UIState = "idle" | "loading" | "success" | "error";

const PRIORITY_STYLES: Record<string, { background: string; color: string }> = {
  Critical: { background: "#FCEBEB", color: "#A32D2D" },
  High:     { background: "#FAEEDA", color: "#854F0B" },
  Medium:   { background: "#E6F1FB", color: "#185FA5" },
  Low:      { background: "#EAF3DE", color: "#3B6D11" },
};

export function CaseTriagePanel({ caseId, noteText }: Props) {
  const [state, setState]       = useState<UIState>("idle");
  const [result, setResult]     = useState<TriageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleAnalyze() {
    setState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/admin/case-triage/${caseId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Non-streaming by default — guaranteed structured TriageResult response
        body: JSON.stringify({ noteText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Unexpected error from server");
      }

      setResult(data as TriageResult);
      setState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  const priorityStyle = result ? PRIORITY_STYLES[result.priority] : null;

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      <button
        onClick={handleAnalyze}
        disabled={state === "loading"}
        style={{ marginBottom: "1rem" }}
      >
        {state === "loading" ? "Analysing…" : "Run triage analysis"}
      </button>

      {state === "error" && (
        <div style={{
          padding: "12px 16px",
          background: "var(--color-background-danger)",
          color: "var(--color-text-danger)",
          borderRadius: "var(--border-radius-md)",
          fontSize: "14px",
          marginBottom: "1rem",
        }}>
          {errorMsg}
        </div>
      )}

      {state === "success" && result && priorityStyle && (
        <div style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "1rem 1.25rem",
        }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: "var(--border-radius-md)",
              fontSize: "12px",
              fontWeight: 500,
              background: priorityStyle.background,
              color: priorityStyle.color,
            }}>
              {result.priority}
            </span>
          </div>

          <p style={{
            fontSize: "15px",
            color: "var(--color-text-primary)",
            marginBottom: "12px",
            lineHeight: 1.6,
          }}>
            {result.summary}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            {result.tags.map(tag => (
              <span key={tag} style={{
                padding: "4px 10px",
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-md)",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}>
                {tag}
              </span>
            ))}
          </div>

          <div style={{
            borderTop: "0.5px solid var(--color-border-tertiary)",
            paddingTop: "12px",
            display: "flex",
            gap: "16px",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
          }}>
            <span>Confidence: <strong>{result.confidence}%</strong></span>
            <span>Model: {result.modelUsed}</span>
            <span>Prompt: {result.promptVersion}</span>
          </div>
        </div>
      )}
    </div>
  );
}
