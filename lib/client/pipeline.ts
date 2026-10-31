// Client-side pipeline orchestrator: convert → validate → execute → compare →
// fix. Runs in the browser, talks to the AI routes over NDJSON streams, and
// executes code either via the Docker API route or in-browser Web Workers.

import { compareOutputs } from "@/lib/compare";
import { getLanguage, isGraphical, isPlayable } from "@/lib/languages";
import { runInBrowser } from "@/lib/client/browser-exec";
import { activeModel, aiHeaders } from "@/lib/client/settings";
import {
  getProviderInfo,
  type AIStreamEvent,
  type AppSettings,
  type Capabilities,
  type ConvertRequestBody,
  type ExecuteRequestBody,
  type ExecutionEnvironment,
  type ExecutionResult,
  type FixAttemptRecord,
  type FixRequestBody,
  type LanguageId,
  type OutputComparison,
  type PipelineEvent,
  type VerificationResult,
} from "@/lib/types";

export type PipelineInput = {
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  sourceCode: string;
  settings: AppSettings;
  capabilities: Capabilities;
};

export async function fetchCapabilities(): Promise<Capabilities> {
  const res = await fetch("/api/capabilities", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't load capabilities (HTTP ${res.status}).`);
  }
  return (await res.json()) as Capabilities;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong while talking to the server.";
}

/** POST a JSON body and yield the NDJSON AIStreamEvents from the response. */
async function* streamAI(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): AsyncGenerator<AIStreamEvent> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    throw new Error(
      "Couldn't reach the server. Check your network and that the dev server is running.",
    );
  }

  if (!res.ok) {
    let message = `The server responded with an error (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error("The server response had no body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Buffer handles NDJSON lines split across network chunks.
  let buffer = "";

  const parseLine = (line: string): AIStreamEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as AIStreamEvent;
    } catch {
      return null; // tolerate a malformed line rather than killing the run
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseLine(line);
      if (event) yield event;
    }
  }
  buffer += decoder.decode();
  const last = parseLine(buffer);
  if (last) yield last;
}

/** Which environment (if any) can execute this language right now. */
function envFor(id: LanguageId, caps: Capabilities): ExecutionEnvironment | null {
  const state = caps.execution.languages[id];
  if (!state) return null;
  if (state.docker === "ready") return "docker";
  if (state.browser) return "browser";
  return null;
}

function missingEnvReason(id: LanguageId, caps: Capabilities): string {
  const config = getLanguage(id);
  if (!caps.execution.docker) {
    return `${config.name} can't be executed here — Docker isn't available. Conversion is unverified.`;
  }
  if (caps.execution.languages[id]?.docker === "image-missing") {
    return `${config.name} can't be executed here — the Docker image ${config.dockerImage} isn't pulled yet. Conversion is unverified.`;
  }
  return `${config.name} can't be executed here. Conversion is unverified.`;
}

/** Why `id` can't be run here (short, for the Run button), or null when it can. */
export function runUnavailableReason(id: LanguageId, caps: Capabilities): string | null {
  if (envFor(id, caps)) return null;
  const config = getLanguage(id);
  if (!caps.execution.docker) return `${config.name} needs Docker Desktop to run.`;
  if (caps.execution.languages[id]?.docker === "image-missing") {
    return `${config.name} needs the Docker image ${config.dockerImage} (docker pull ${config.dockerImage}).`;
  }
  return `${config.name} can't run here.`;
}

/** Run one program on its own — the editors' Run button. */
export async function runCode(
  id: LanguageId,
  code: string,
  caps: Capabilities,
  signal?: AbortSignal,
  onStatus?: (text: string) => void,
): Promise<ExecutionResult> {
  const environment = envFor(id, caps);
  if (!environment) {
    return infraResult("browser", Date.now(), runUnavailableReason(id, caps) ?? "Can't run here.");
  }
  return executeCode(id, code, environment, signal, onStatus);
}

function buildConvertBody(input: PipelineInput): ConvertRequestBody {
  return {
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    sourceCode: input.sourceCode,
    provider: input.settings.provider,
    model: activeModel(input.settings),
  };
}

/** Human label for whoever does the converting, shown in the report. */
function modelLabel(input: PipelineInput): string {
  return `${getProviderInfo(input.settings.provider).name} · ${activeModel(input.settings)}`;
}

function infraResult(
  environment: ExecutionEnvironment,
  startedAt: number,
  infraError: string,
): ExecutionResult {
  return {
    ok: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    timedOut: false,
    truncated: false,
    durationMs: Date.now() - startedAt,
    environment,
    infraError,
  };
}

async function executeCode(
  languageId: LanguageId,
  code: string,
  environment: ExecutionEnvironment,
  signal?: AbortSignal,
  onStatus?: (text: string) => void,
): Promise<ExecutionResult> {
  const startedAt = Date.now();

  if (environment === "browser") {
    try {
      return await runInBrowser(languageId, code, { onStatus });
    } catch (err) {
      return infraResult("browser", startedAt, errorText(err));
    }
  }

  try {
    const body: ExecuteRequestBody = { languageId, code };
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      return infraResult(
        "docker",
        startedAt,
        `The execution service responded with HTTP ${res.status}.`,
      );
    }
    return (await res.json()) as ExecutionResult;
  } catch {
    return infraResult(
      "docker",
      startedAt,
      "Couldn't reach the execution service. Check your network.",
    );
  }
}

function doneEvent(
  targetCode: string,
  notes: string | undefined,
  verification: VerificationResult,
): PipelineEvent {
  return {
    type: "done",
    outcome: {
      targetCode,
      ...(notes !== undefined ? { notes } : {}),
      verification,
    },
  };
}

const VERIFIED_REASON = "Source and target produced identical output.";

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export async function* runPipeline(
  input: PipelineInput,
  signal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  const { capabilities, settings, sourceLanguage, targetLanguage } = input;
  const convertBody = buildConvertBody(input);
  const model = modelLabel(input);

  // 1. Convert (analyze → generate).
  yield { type: "stage", stage: "analyze" };

  let targetCode = "";
  let notes: string | undefined;
  let sawCode = false;
  let finished = false;

  try {
    for await (const ev of streamAI("/api/ai/convert", convertBody, aiHeaders(settings), signal)) {
      if (signal?.aborted) return;
      if (ev.type === "analysis-delta") {
        yield ev;
      } else if (ev.type === "code-delta") {
        if (!sawCode) {
          sawCode = true;
          yield { type: "stage", stage: "generate" };
        }
        yield ev;
      } else if (ev.type === "error") {
        yield { type: "error", message: ev.message, ...(ev.detail ? { detail: ev.detail } : {}) };
        return;
      } else {
        targetCode = ev.code;
        notes = ev.notes;
        finished = true;
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    yield { type: "error", message: errorText(err) };
    return;
  }

  if (signal?.aborted) return;
  if (!finished) {
    yield { type: "error", message: "The AI stream ended before the conversion finished. Try again." };
    return;
  }

  // A graphical program's output is a window, not stdout — running it here would
  // only crash or loop forever, and there's no text to compare. Say so honestly.
  if (isGraphical(sourceLanguage, input.sourceCode) || isGraphical(targetLanguage, targetCode)) {
    yield doneEvent(targetCode, notes, {
      status: "partial",
      reason: isPlayable(targetLanguage, targetCode)
        ? "Graphical program: its output is a window, not text, so it can't be compared automatically. Press Play on the converted code to try it."
        : "Graphical program: its output is a window, not text, so it can't be compared or run here.",
      fixAttempts: 0,
      graphical: true,
      model,
    });
    return;
  }

  // 2. Decide execution environments.
  const sourceEnv = envFor(sourceLanguage, capabilities);
  const targetEnv = envFor(targetLanguage, capabilities);

  // 3. Validation happens as part of execution (compile step in Docker,
  //    transpile check in the TS worker). No environment → stop early.
  yield { type: "stage", stage: "validate" };

  if (!sourceEnv && !targetEnv) {
    yield doneEvent(targetCode, notes, {
      status: "unavailable",
      reason: "No execution environment is available for either language.",
      fixAttempts: 0,
      model,
    });
    return;
  }
  if (!sourceEnv || !targetEnv) {
    const missing = !sourceEnv ? sourceLanguage : targetLanguage;
    yield doneEvent(targetCode, notes, {
      status: "partial",
      reason: missingEnvReason(missing, capabilities),
      fixAttempts: 0,
      model,
    });
    return;
  }

  // 4. Execute source and target concurrently. The source runs a second time
  //    (after its first run, never alongside it — the browser tier reuses one
  //    worker per language) so nondeterministic output isn't blamed on the AI.
  yield { type: "stage", stage: "execute" };
  const runSourceTwice = async () => {
    const first = await executeCode(sourceLanguage, input.sourceCode, sourceEnv, signal);
    if (!first.ok || signal?.aborted) return { first, second: null };
    const second = await executeCode(sourceLanguage, input.sourceCode, sourceEnv, signal);
    return { first, second };
  };
  const [{ first: sourceRun, second: sourceRerun }, targetRun] = await Promise.all([
    runSourceTwice(),
    executeCode(targetLanguage, targetCode, targetEnv, signal),
  ]);
  if (signal?.aborted) return;
  yield { type: "execution", side: "source", result: sourceRun };
  yield { type: "execution", side: "target", result: targetRun };

  const infraError = sourceRun.infraError ?? sourceRerun?.infraError ?? targetRun.infraError;
  if (infraError) {
    yield doneEvent(targetCode, notes, {
      status: "partial",
      reason: infraError,
      sourceRun,
      targetRun,
      fixAttempts: 0,
      model,
    });
    return;
  }

  if (!sourceRun.ok || !sourceRerun) {
    // No reference output to verify against — skip the fix loop entirely.
    yield doneEvent(targetCode, notes, {
      status: "partial",
      reason:
        "The source program exits with an error, so there is no reference output to verify against.",
      sourceRun,
      targetRun,
      fixAttempts: 0,
      model,
    });
    return;
  }

  // 5. Compare — first the source against itself, then against the target.
  yield { type: "stage", stage: "compare" };
  const stable =
    sourceRerun.ok && compareOutputs(sourceRun.stdout, sourceRerun.stdout).match;
  if (!stable) {
    yield doneEvent(targetCode, notes, {
      status: "partial",
      reason: sourceRerun.ok
        ? "The original prints different output each run (likely random numbers or the current time), so the outputs can't be compared."
        : "The original failed when run a second time, so its output isn't reliable enough to compare against.",
      sourceRun,
      targetRun,
      fixAttempts: 0,
      stable,
      model,
    });
    return;
  }

  const comparison = compareOutputs(sourceRun.stdout, targetRun.stdout);

  if (targetRun.ok && comparison.match) {
    yield doneEvent(targetCode, notes, {
      status: "verified",
      reason: VERIFIED_REASON,
      sourceRun,
      targetRun,
      match: true,
      fixAttempts: 0,
      stable,
      model,
    });
    return;
  }

  // 6–7. Mismatch or target crash → fix loop, then the final outcome.
  yield* fixLoop({
    convertBody,
    headers: aiHeaders(settings),
    sourceRun,
    targetRun,
    comparison,
    targetCode,
    notes,
    targetEnv,
    targetLanguage,
    firstAttempt: 1,
    lastAttempt: settings.fixAttempts,
    meta: { model, stable, attempts: [] },
    signal,
  });
}

/**
 * One extra fix cycle for the "Fix conversion" button: starts at the fix stage
 * using the runs recorded in a previous verification.
 */
export async function* runFixCycle(
  input: PipelineInput,
  previous: { targetCode: string; verification: VerificationResult },
  signal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  const { sourceRun, targetRun } = previous.verification;
  if (!sourceRun || !targetRun) {
    yield {
      type: "error",
      message: "There are no recorded runs to fix against — run a conversion first.",
    };
    return;
  }

  const targetEnv = envFor(input.targetLanguage, input.capabilities);
  if (!targetEnv) {
    yield { type: "error", message: missingEnvReason(input.targetLanguage, input.capabilities) };
    return;
  }

  const attempt = previous.verification.fixAttempts + 1;
  const { model, stable, attempts = [] } = previous.verification;
  yield* fixLoop({
    convertBody: buildConvertBody(input),
    headers: aiHeaders(input.settings),
    sourceRun,
    targetRun,
    comparison: compareOutputs(sourceRun.stdout, targetRun.stdout),
    targetCode: previous.targetCode,
    notes: undefined,
    targetEnv,
    targetLanguage: input.targetLanguage,
    firstAttempt: attempt,
    lastAttempt: attempt,
    meta: { model, stable, attempts },
    signal,
  });
}

// ---------------------------------------------------------------------------
// Fix loop (shared by runPipeline and runFixCycle)
// ---------------------------------------------------------------------------

type FixLoopParams = {
  convertBody: ConvertRequestBody;
  /** Request headers for the AI routes (carries the API key) */
  headers: Record<string, string>;
  sourceRun: ExecutionResult;
  targetRun: ExecutionResult;
  comparison: OutputComparison;
  targetCode: string;
  notes: string | undefined;
  targetEnv: ExecutionEnvironment;
  targetLanguage: LanguageId;
  firstAttempt: number;
  lastAttempt: number;
  /** Carried into every verification result; `attempts` holds earlier fix history */
  meta: Pick<VerificationResult, "model" | "stable"> & { attempts: FixAttemptRecord[] };
  signal?: AbortSignal;
};

async function* fixLoop(p: FixLoopParams): AsyncGenerator<PipelineEvent> {
  let { targetRun, comparison, targetCode, notes } = p;
  let attemptsUsed = p.firstAttempt - 1;
  const attempts = [...p.meta.attempts];
  const meta = () => ({ ...p.meta, attempts: [...attempts] });

  for (let attempt = p.firstAttempt; attempt <= p.lastAttempt; attempt++) {
    if (p.signal?.aborted) return;
    attemptsUsed = attempt;

    yield { type: "stage", stage: "fix", detail: `Attempt ${attempt}` };
    yield { type: "code-reset" };

    const fixBody: FixRequestBody = {
      ...p.convertBody,
      targetCode,
      sourceOutput: comparison.source,
      targetOutput: comparison.target,
      targetStderr: targetRun.stderr,
      attempt,
    };

    let fixedCode: string | null = null;
    let diagnosis = "";
    try {
      for await (const ev of streamAI("/api/ai/fix", fixBody, p.headers, p.signal)) {
        if (p.signal?.aborted) return;
        if (ev.type === "code-delta" || ev.type === "analysis-delta") {
          if (ev.type === "analysis-delta") diagnosis += ev.text;
          yield ev;
        } else if (ev.type === "error") {
          yield { type: "error", message: ev.message, ...(ev.detail ? { detail: ev.detail } : {}) };
          return;
        } else {
          fixedCode = ev.code;
          if (ev.notes !== undefined) notes = ev.notes;
        }
      }
    } catch (err) {
      if (p.signal?.aborted) return;
      yield { type: "error", message: errorText(err) };
      return;
    }

    if (p.signal?.aborted) return;
    if (fixedCode === null) {
      yield { type: "error", message: "The AI stream ended before the fix finished. Try again." };
      return;
    }
    targetCode = fixedCode;

    // Re-execute only the target — the source's reference output is unchanged.
    yield { type: "stage", stage: "execute" };
    targetRun = await executeCode(p.targetLanguage, targetCode, p.targetEnv, p.signal);
    if (p.signal?.aborted) return;
    yield { type: "execution", side: "target", result: targetRun };

    if (targetRun.infraError) {
      attempts.push({ attempt, diagnosis: diagnosis.trim(), matched: false });
      yield doneEvent(targetCode, notes, {
        status: "partial",
        reason: targetRun.infraError,
        sourceRun: p.sourceRun,
        targetRun,
        fixAttempts: attemptsUsed,
        ...meta(),
      });
      return;
    }

    yield { type: "stage", stage: "compare" };
    comparison = compareOutputs(p.sourceRun.stdout, targetRun.stdout);
    const matched = targetRun.ok && comparison.match;
    attempts.push({ attempt, diagnosis: diagnosis.trim(), matched });

    if (matched) {
      yield doneEvent(targetCode, notes, {
        status: "verified",
        reason: VERIFIED_REASON,
        sourceRun: p.sourceRun,
        targetRun,
        match: true,
        fixAttempts: attemptsUsed,
        ...meta(),
      });
      return;
    }
  }

  yield doneEvent(targetCode, notes, {
    status: "failed",
    reason: targetRun.ok ? "Outputs differ." : "Target program exited with an error.",
    sourceRun: p.sourceRun,
    targetRun,
    match: false,
    fixAttempts: attemptsUsed,
    ...meta(),
  });
}
