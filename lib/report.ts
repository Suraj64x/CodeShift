// Turns a VerificationResult into the report card: one row per check plus a
// plain-English summary. Every sentence here is built from measured facts —
// never from AI text — so the report can't claim more than was actually run.
// Self-check: `node lib/report.check.ts`

import { compareOutputs } from "./compare.ts";
import type { ExecutionEnvironment, ExecutionResult, VerificationResult } from "./types";

export type CheckState = "pass" | "warn" | "fail" | "skip";
export type ReportRow = { label: string; state: CheckState; detail: string };
export type Report = { summary: string; rows: ReportRow[] };

const WHERE: Record<ExecutionEnvironment, string> = {
  browser: "in your browser",
  docker: "in the Docker sandbox",
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function runRow(
  label: string,
  run: ExecutionResult | undefined,
  languageName: string,
  graphical = false,
): ReportRow {
  if (!run) {
    return { label, state: "skip", detail: graphical ? "Graphical, not auto-run" : `${languageName} can't run here` };
  }
  if (run.infraError) return { label, state: "warn", detail: `Sandbox problem · ${run.environment}` };
  if (run.timedOut) return { label, state: "fail", detail: `Timed out · ${run.environment}` };
  if (!run.ok) {
    return { label, state: "fail", detail: `Exit code ${run.exitCode ?? "?"} · ${run.environment}` };
  }
  return { label, state: "pass", detail: `${run.environment} · exit 0 · ${run.durationMs} ms` };
}

function crashText(run: ExecutionResult): string {
  return run.timedOut ? "timed out" : `exited with an error (exit code ${run.exitCode ?? "?"})`;
}

export function buildReport(
  v: VerificationResult,
  sourceName: string,
  targetName: string,
): Report {
  const { sourceRun, targetRun } = v;
  const fixes = v.fixAttempts;
  const rows: ReportRow[] = [
    { label: "Converted", state: "pass", detail: v.model ?? "AI" },
    runRow("Original ran", sourceRun, sourceName, v.graphical),
  ];

  if (sourceRun?.ok) {
    rows.push(
      v.stable === true
        ? { label: "Original stable", state: "pass", detail: "Same output on 2 runs" }
        : v.stable === false
          ? { label: "Original stable", state: "warn", detail: "Output changed between runs" }
          : { label: "Original stable", state: "skip", detail: "Not checked" },
    );
  }
  rows.push(runRow("Converted ran", targetRun, targetName, v.graphical));

  // Outputs are only meaningfully compared against a stable, successful source.
  const comparable =
    sourceRun?.ok && targetRun && !sourceRun.infraError && !targetRun.infraError && v.stable !== false;
  const c = comparable ? compareOutputs(sourceRun.stdout, targetRun.stdout) : null;
  const lines = c && c.source !== "" ? c.source.split("\n").length : 0;

  if (!c || !targetRun) {
    rows.push({ label: "Outputs match", state: "skip", detail: "Not compared" });
  } else if (!c.match) {
    rows.push({
      label: "Outputs match",
      state: "fail",
      detail: `First difference at line ${(c.firstDiffLine ?? 0) + 1}`,
    });
  } else if (!targetRun.ok) {
    rows.push({ label: "Outputs match", state: "fail", detail: "Same output, but the program crashed" });
  } else if (lines === 0) {
    rows.push({ label: "Outputs match", state: "warn", detail: "Both printed nothing" });
  } else {
    rows.push({ label: "Outputs match", state: "pass", detail: `${lines} / ${lines} lines identical` });
  }

  if (fixes > 0) {
    rows.push({
      label: "Auto-fix",
      state: v.status === "verified" ? "pass" : "fail",
      detail: plural(fixes, "attempt"),
    });
  }

  let summary = v.reason;
  if (v.status === "verified" && sourceRun && targetRun) {
    const where =
      sourceRun.environment === targetRun.environment
        ? WHERE[sourceRun.environment]
        : `(original ${WHERE[sourceRun.environment]}, converted ${WHERE[targetRun.environment]})`;
    summary =
      lines === 0
        ? `Both programs ran ${where} and printed nothing, so there was no output to compare.`
        : `Both programs ran ${where} and printed the same ${plural(lines, "line")}.`;
    if (fixes > 0) summary += ` Fixed automatically after ${plural(fixes, "attempt")}.`;
  } else if (v.status === "failed" && targetRun) {
    summary =
      !targetRun.ok
        ? `The converted program ${crashText(targetRun)}.`
        : `The converted program printed different output, starting at line ${(c?.firstDiffLine ?? 0) + 1}.`;
    if (fixes > 0) summary += ` The AI tried ${plural(fixes, "fix attempt")} without success.`;
  }

  return { summary, rows };
}
