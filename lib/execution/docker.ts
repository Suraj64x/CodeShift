// Sandboxed server-side execution. Every run gets a fresh disposable Docker
// container with no network, capped memory/CPU/processes, and a read-only
// filesystem. User code is written to a temp file and bind-mounted read-only —
// it is NEVER interpolated into a host shell command and NEVER runs on the host.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLanguage } from "@/lib/languages";
import type { ExecutionResult, LanguageId } from "@/lib/types";

const RUN_TIMEOUT_MS = 15_000;
const OUTPUT_CAP_BYTES = 64 * 1024;
const CODE_SIZE_LIMIT = 100_000;
const MAX_CONCURRENT_CONTAINERS = 2;

// ---------------------------------------------------------------------------
// Execution queue: at most 2 containers at once; extra requests wait in FIFO
// order. release() hands the slot directly to the next waiter so the count
// can never exceed the limit.
// ---------------------------------------------------------------------------

let activeSlots = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeSlots < MAX_CONCURRENT_CONTAINERS) {
    activeSlots += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next(); // slot transfers to the waiter; activeSlots stays the same
  } else {
    activeSlots -= 1;
  }
}

// ---------------------------------------------------------------------------

export async function executeInDocker(
  languageId: LanguageId,
  code: string
): Promise<ExecutionResult> {
  if (code.length > CODE_SIZE_LIMIT) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      truncated: false,
      durationMs: 0,
      environment: "docker",
      infraError: "Code exceeds the 100,000 character execution limit.",
    };
  }

  await acquireSlot();
  try {
    return await runInFreshContainer(languageId, code);
  } finally {
    releaseSlot();
  }
}

async function runInFreshContainer(
  languageId: LanguageId,
  code: string
): Promise<ExecutionResult> {
  const config = getLanguage(languageId);

  // The code goes into a temp dir that gets bind-mounted read-only at /work.
  const workDir = await mkdtemp(path.join(os.tmpdir(), "codeshift-"));
  try {
    await writeFile(path.join(workDir, config.fileName), code, "utf8");
    return await spawnContainer(config.dockerImage, config.executeCommand, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function spawnContainer(
  image: string,
  executeCommand: string,
  workDir: string
): Promise<ExecutionResult> {
  const containerName = `codeshift-${randomBytes(6).toString("hex")}`;

  // Argument array only — never a host shell string. The single `sh -c` below
  // runs INSIDE the container. tmpfs /tmp needs `exec` because compiled
  // languages build their binary there and run it.
  const args = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--network",
    "none",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--read-only",
    "-v",
    `${workDir}:/work:ro`,
    "--tmpfs",
    "/tmp:rw,exec,size=64m",
    "--workdir",
    "/work",
    image,
    "sh",
    "-c",
    executeCommand,
  ];

  return new Promise<ExecutionResult>((resolve) => {
    const startedAt = Date.now();
    const child = spawn("docker", args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const settle = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      // Fire-and-forget: make sure the container itself dies, not just the CLI.
      const killer = spawn("docker", ["kill", containerName], { windowsHide: true });
      killer.on("error", () => {});
      child.kill();
    }, RUN_TIMEOUT_MS);

    // No stdin: close it so programs that read input see EOF instead of hanging.
    child.stdin.end();

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= OUTPUT_CAP_BYTES) {
        truncated = true;
        return;
      }
      const remaining = OUTPUT_CAP_BYTES - stdoutBytes;
      if (chunk.length > remaining) {
        stdout += chunk.subarray(0, remaining).toString("utf8");
        stdoutBytes = OUTPUT_CAP_BYTES;
        truncated = true;
      } else {
        stdout += chunk.toString("utf8");
        stdoutBytes += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes >= OUTPUT_CAP_BYTES) {
        truncated = true;
        return;
      }
      const remaining = OUTPUT_CAP_BYTES - stderrBytes;
      if (chunk.length > remaining) {
        stderr += chunk.subarray(0, remaining).toString("utf8");
        stderrBytes = OUTPUT_CAP_BYTES;
        truncated = true;
      } else {
        stderr += chunk.toString("utf8");
        stderrBytes += chunk.length;
      }
    });

    child.on("error", () => {
      settle({
        ok: false,
        stdout,
        stderr,
        exitCode: null,
        timedOut: false,
        truncated,
        durationMs: Date.now() - startedAt,
        environment: "docker",
        infraError:
          "Couldn't start the docker command. Is Docker installed and running?",
      });
    });

    child.on("close", (exitCode) => {
      const durationMs = Date.now() - startedAt;
      const base = {
        stdout,
        stderr,
        exitCode,
        truncated,
        durationMs,
        environment: "docker" as const,
      };

      if (timedOut) {
        // Covers exit 137 caused by our own kill.
        settle({ ...base, ok: false, timedOut: true });
        return;
      }

      if (exitCode === 125 || exitCode === 126 || exitCode === 127) {
        // Docker daemon / container-command failures, not a program error.
        settle({
          ...base,
          ok: false,
          timedOut: false,
          infraError: dockerExitExplanation(exitCode),
        });
        return;
      }

      if (exitCode === 137) {
        // Killed by the kernel without our timeout firing — almost certainly
        // the 256 MB memory cap.
        const note = "Killed — likely exceeded the 256 MB memory limit.";
        settle({
          ...base,
          stderr: stderr ? `${stderr.replace(/\n$/, "")}\n${note}` : note,
          ok: false,
          timedOut: false,
        });
        return;
      }

      settle({ ...base, ok: exitCode === 0, timedOut: false });
    });
  });
}

function dockerExitExplanation(exitCode: 125 | 126 | 127): string {
  switch (exitCode) {
    case 125:
      return "Docker failed to start the container (exit 125) — the daemon rejected the run.";
    case 126:
      return "The command inside the container couldn't be executed (exit 126).";
    case 127:
      return "The command inside the container wasn't found (exit 127) — the image may be broken.";
  }
}
