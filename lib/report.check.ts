// Self-check for lib/report.ts — run with `node lib/report.check.ts`.
import assert from "node:assert/strict";
import { buildReport } from "./report.ts";
import type { ExecutionResult } from "./types";

const run = (stdout: string, ok = true): ExecutionResult => ({
  ok,
  stdout,
  stderr: "",
  exitCode: ok ? 0 : 1,
  timedOut: false,
  truncated: false,
  durationMs: 40,
  environment: "browser",
});

// Verified after a fix: summary states the measured facts.
let r = buildReport(
  {
    status: "verified",
    reason: "",
    sourceRun: run("a\nb\n"),
    targetRun: run("a\nb"),
    match: true,
    fixAttempts: 1,
    stable: true,
  },
  "Python",
  "Go",
);
assert.equal(
  r.summary,
  "Both programs ran in your browser and printed the same 2 lines. Fixed automatically after 1 attempt.",
);
assert.deepEqual(
  r.rows.map((row) => row.state),
  ["pass", "pass", "pass", "pass", "pass", "pass"],
);

// Nondeterministic source: nothing is compared, nothing claims a match.
r = buildReport(
  {
    status: "partial",
    reason: "The original prints different output each run.",
    sourceRun: run("0.42"),
    targetRun: run("0.17"),
    fixAttempts: 0,
    stable: false,
  },
  "Python",
  "Go",
);
assert.equal(r.summary, "The original prints different output each run.");
assert.equal(r.rows.find((row) => row.label === "Outputs match")?.state, "skip");

// Failed: points at the first differing line, never says "same".
r = buildReport(
  {
    status: "failed",
    reason: "Outputs differ.",
    sourceRun: run("1\n2\n3"),
    targetRun: run("1\n2\n4"),
    match: false,
    fixAttempts: 2,
    stable: true,
  },
  "Python",
  "Go",
);
assert.equal(
  r.summary,
  "The converted program printed different output, starting at line 3. The AI tried 2 fix attempts without success.",
);
assert.equal(r.rows.find((row) => row.label === "Outputs match")?.detail, "First difference at line 3");

// No execution at all: every run row is skipped.
r = buildReport({ status: "unavailable", reason: "No env.", fixAttempts: 0 }, "Java", "Rust");
assert.deepEqual(
  r.rows.map((row) => row.state),
  ["pass", "skip", "skip", "skip"],
);

// Graphical: nothing ran, rows say why, summary is the honest reason.
r = buildReport(
  { status: "partial", reason: "Graphical program.", fixAttempts: 0, graphical: true },
  "Python",
  "JavaScript",
);
assert.equal(r.summary, "Graphical program.");
assert.equal(r.rows.find((row) => row.label === "Original ran")?.detail, "Graphical, not auto-run");

console.log("report: all checks passed");
