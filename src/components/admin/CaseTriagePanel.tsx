"use client";

import { useState, useRef } from "react";
import { TriageResult } from "@/types/triage";

interface Props {
  caseId: string;
  noteText: string;
}

type UIState = "idle" | "loading" | "streaming" | "success" | "error";

const PRIORITY_STYLES: Record<string, { background: string; color: string }> = {
  Critical: { background: "#FCEBEB", color: "#A32D2D" },
  High:     { background: "#FAEEDA", color: "#854F0B" },
  Medium:   { background: "#E6F1FB", color: "#185FA5" },
  Low:      { background: "#EAF3DE", color: "#3B6D11" },
};

export function CaseTriagePanel({ caseId, noteText }: Props) {
  const [state, setState] = useState<UIState>("idle");
  const [result, setResult] = useState<TriageResult | null>(null);
  const [streamText, setStreamText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleAnalyze() {
    setState("streaming");
    setResult(null);
    setStreamText("");
    setErrorMsg("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/admin/case-triage/${caseId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "Unexpected error from server");
      }

      // Read the stream and accumulate
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamText(accumulated);
      }

      // Parse the final accumulated JSON into a result
      const parsed = JSON.parse(accumulated) as TriageResult;
      setResult(parsed);
      setState("success");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setState("idle");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  const priorityStyle = result ? PRIORITY_STYLES[result.priority] : null;

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
        <button
          onClick={handleAnalyze}
          disabled={state === "streaming" || state === "loading"}
        >
          {state === "streaming" ? "Analysing…" : "Run triage analysis"}
        </button>
        {state === "streaming" && (
          <button onClick={handleCancel} style={{ color: "var(--color-text-danger)" }}>
            Cancel
          </button>
        )}
      </div>

      {/* Streaming raw text preview */}
      {state === "streaming" && streamText && (
        <div style={{
          padding: "12px 16px",
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
          marginBottom: "1rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}>
          {streamText}
          <span style={{ opacity: 0.4 }}>▋</span>
        </div>
      )}

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
          {/* Priority badge */}
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

          {/* Summary */}
          <p style={{
            fontSize: "15px",
            color: "var(--color-text-primary)",
            marginBottom: "12px",
            lineHeight: 1.6,
          }}>
            {result.summary}
          </p>

          {/* Tags */}
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

          {/* Confidence + metadata */}
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
