# Verification report + stability check — design

Approved 2026-10-30. First of three sub-projects (next: visual polish, rewards).

## Goal
After every conversion, tell the user plainly what was checked and what happened,
and stop mislabelling nondeterministic programs as failed conversions.

## Scope
1. **Stability check** — the source runs twice (concurrently with the target). If
   the two source outputs differ, status is `partial` with reason "the original
   prints different output each run", and the fix loop is skipped.
2. **Fix history** — each fix attempt records `{ attempt, diagnosis, matched }`,
   where diagnosis is the AI's streamed `<analysis>` text.
3. **Report card** — replaces the one-line status in `VerificationPanel`: headline
   verdict, plain-English summary, per-step rows (✓ △ ✕ —), expandable outputs and
   fix history, AI notes.

Out of scope: online code runner, stdin/test-input generation, code diffs.

## Contract changes (`lib/types.ts`)
`VerificationResult` gains optional `stable?: boolean`, `attempts?: FixAttemptRecord[]`,
`model?: string`. Statuses unchanged.

## Honesty rule
The summary sentence is built in `lib/report.ts` from measured facts only — never
from AI text. `lib/report.ts` ships a runnable self-check.

## Testing
Demo mode, Python → JavaScript sample → ✓ report. Python script printing
`random.random()` → △ "different output each run".
