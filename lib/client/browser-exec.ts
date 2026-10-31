// Client-side sandboxed execution: runs JavaScript, TypeScript, and Python in
// Web Workers on the user's machine — user code never touches the web server.
// Worker scripts live in /public/workers (classic workers, not modules).
//
// This module is client-only: every entry point guards against SSR, so merely
// importing it from a client component is safe.

import type { ExecutionResult, LanguageId } from "@/lib/types";

const WORKER_URLS: Partial<Record<LanguageId, string>> = {
  javascript: "/workers/js-runner.js",
  typescript: "/workers/ts-runner.js",
  python: "/workers/py-runner.js",
};

// Wall-clock limits. Python gets longer because the first run may still be
// downloading the Pyodide runtime — while the worker reports loading status,
// the deadline stretches to PY_LOADING_TIMEOUT_MS (measured from run start).
const JS_TIMEOUT_MS = 10_000;
const PY_TIMEOUT_MS = 15_000;
const PY_LOADING_TIMEOUT_MS = 90_000;

type WorkerMessage = {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  exitCode?: unknown;
  truncated?: unknown;
  infraError?: unknown;
  /** The runtime inside the worker died; replace the worker before the next run */
  restart?: unknown;
};

type PendingRun = {
  languageId: LanguageId;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
  deadlineExtended: boolean;
  onStatus?: (text: string) => void;
  resolve: (result: ExecutionResult) => void;
};

// One singleton worker per language, reused across runs (keeps Pyodide warm).
const workers = new Map<LanguageId, Worker>();
const pendingRuns = new Map<string, PendingRun>();
let nextRequestId = 0;

export function canRunInBrowser(id: LanguageId): boolean {
  return WORKER_URLS[id] !== undefined;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function infraResult(startedAt: number, message: string): ExecutionResult {
  return {
    ok: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    timedOut: false,
    truncated: false,
    durationMs: Math.max(0, Date.now() - startedAt),
    environment: "browser",
    infraError: message,
  };
}

function settle(requestId: string, result: ExecutionResult): void {
  const run = pendingRuns.get(requestId);
  if (!run) return;
  clearTimeout(run.timer);
  pendingRuns.delete(requestId);
  run.resolve(result);
}

function settleAllForLanguage(
  languageId: LanguageId,
  toResult: (run: PendingRun) => ExecutionResult
): void {
  for (const [requestId, run] of Array.from(pendingRuns.entries())) {
    if (run.languageId === languageId) settle(requestId, toResult(run));
  }
}

function discardWorker(languageId: LanguageId): void {
  const worker = workers.get(languageId);
  if (!worker) return;
  worker.terminate();
  workers.delete(languageId);
}

function timeOutRun(requestId: string): void {
  const run = pendingRuns.get(requestId);
  if (!run) return;
  // A hung worker can't be interrupted — kill it; the next run gets a fresh
  // one (for Python that means re-initializing Pyodide).
  discardWorker(run.languageId);
  settle(requestId, {
    ok: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    timedOut: true,
    truncated: false,
    durationMs: Date.now() - run.startedAt,
    environment: "browser",
  });
  // Anything else queued on the now-dead worker can never complete.
  settleAllForLanguage(run.languageId, (other) =>
    infraResult(other.startedAt, "The browser sandbox was restarted after a timeout.")
  );
}

function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as WorkerMessage | null;
  if (!data || typeof data !== "object") return;
  const requestId = data.id;
  if (typeof requestId !== "string") return;
  const run = pendingRuns.get(requestId);
  if (!run) return;

  if (data.type === "status") {
    const text = typeof data.text === "string" ? data.text : "";
    if (text && run.onStatus) run.onStatus(text);
    // The Python worker reports status while downloading Pyodide — extend the
    // first run's deadline instead of timing out mid-download.
    if (run.languageId === "python" && !run.deadlineExtended) {
      run.deadlineExtended = true;
      clearTimeout(run.timer);
      const remaining = Math.max(1_000, run.startedAt + PY_LOADING_TIMEOUT_MS - Date.now());
      run.timer = setTimeout(() => timeOutRun(requestId), remaining);
    }
    return;
  }

  if (data.type === "result") {
    const exitCode = typeof data.exitCode === "number" ? data.exitCode : null;
    const infraError = typeof data.infraError === "string" ? data.infraError : undefined;
    settle(requestId, {
      ok: exitCode === 0 && infraError === undefined,
      stdout: typeof data.stdout === "string" ? data.stdout : "",
      stderr: typeof data.stderr === "string" ? data.stderr : "",
      exitCode,
      timedOut: false,
      truncated: data.truncated === true,
      durationMs: Date.now() - run.startedAt,
      environment: "browser",
      ...(infraError !== undefined ? { infraError } : {}),
    });
    if (data.restart === true) {
      discardWorker(run.languageId);
      settleAllForLanguage(run.languageId, (other) =>
        infraResult(other.startedAt, "The browser sandbox was restarted after a crash.")
      );
    }
  }
}

function getWorker(languageId: LanguageId): Worker {
  const existing = workers.get(languageId);
  if (existing) return existing;

  const url = WORKER_URLS[languageId];
  if (!url) throw new Error(`No browser runner exists for ${languageId}.`);

  const worker = new Worker(url);
  worker.onmessage = handleWorkerMessage;
  worker.onerror = () => {
    // The worker script itself crashed — most likely its CDN dependency
    // (TypeScript compiler / Pyodide loader) failed to load. Fail any
    // in-flight runs and drop the worker so the next run starts fresh.
    discardWorker(languageId);
    settleAllForLanguage(languageId, (run) =>
      infraResult(
        run.startedAt,
        "The browser sandbox failed to start (its runtime couldn't be loaded). Check your network and try again."
      )
    );
  };
  workers.set(languageId, worker);
  return worker;
}

export function runInBrowser(
  id: LanguageId,
  code: string,
  opts?: { onStatus?: (text: string) => void; transpileOnly?: boolean }
): Promise<ExecutionResult> {
  const startedAt = Date.now();

  if (!isBrowser()) {
    return Promise.resolve(
      infraResult(startedAt, "Browser execution is only available in a browser.")
    );
  }
  if (!canRunInBrowser(id)) {
    return Promise.resolve(infraResult(startedAt, `${id} can't be executed in the browser.`));
  }

  let worker: Worker;
  try {
    worker = getWorker(id);
  } catch (error) {
    return Promise.resolve(
      infraResult(startedAt, error instanceof Error ? error.message : String(error))
    );
  }

  const requestId = `run-${++nextRequestId}-${Date.now().toString(36)}`;
  const timeoutMs = id === "python" ? PY_TIMEOUT_MS : JS_TIMEOUT_MS;

  return new Promise<ExecutionResult>((resolve) => {
    pendingRuns.set(requestId, {
      languageId: id,
      startedAt,
      timer: setTimeout(() => timeOutRun(requestId), timeoutMs),
      deadlineExtended: false,
      onStatus: opts?.onStatus,
      resolve,
    });
    worker.postMessage({ id: requestId, code, transpileOnly: opts?.transpileOnly === true });
  });
}

/**
 * Create the worker for a language ahead of time. For Python this starts the
 * one-time Pyodide download immediately (the worker kicks it off on startup),
 * so it's likely warm by the time the user hits Convert.
 */
export function warmBrowserRuntime(id: LanguageId): void {
  if (!isBrowser() || !canRunInBrowser(id)) return;
  try {
    getWorker(id);
  } catch {
    // Warming is best-effort; a real run will surface any error properly.
  }
}

/** TypeScript → JavaScript via the TS worker (no execution) — used by the Play window. */
export async function transpileTypeScript(
  code: string,
): Promise<{ js: string } | { error: string }> {
  const result = await runInBrowser("typescript", code, { transpileOnly: true });
  if (result.ok) return { js: result.stdout };
  return { error: result.infraError ?? (result.stderr || "TypeScript couldn't be compiled.") };
}
