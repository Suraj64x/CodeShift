// Environment probing: is Docker running, which language images are pulled,
// and is the AI provider configured. Results are cached module-level so the
// UI can poll /api/capabilities cheaply.

import { spawn } from "node:child_process";
import { LANGUAGES } from "@/lib/languages";
import { AI_PROVIDERS, type Capabilities, type DockerLanguageState } from "@/lib/types";

const DOCKER_STATUS_TTL_MS = 60_000;
const IMAGE_STATUS_TTL_MS = 5 * 60_000;
const DOCKER_PROBE_TIMEOUT_MS = 3_000;
const IMAGE_PROBE_TIMEOUT_MS = 5_000;

export type DockerStatus = { available: boolean; version?: string };

/** Spawn `docker <args>`, collect stdout, resolve null exit code on failure/timeout. */
function runDockerCommand(
  args: string[],
  timeoutMs: number
): Promise<{ exitCode: number | null; stdout: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("docker", args, { windowsHide: true });
    } catch {
      resolve({ exitCode: null, stdout: "" });
      return;
    }

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout });
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", () => {
      // Drain so the pipe can't back up; content isn't needed.
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
  });
}

// --- Docker daemon status (cached 60s) -------------------------------------

let dockerStatusCache: { at: number; promise: Promise<DockerStatus> } | null = null;

export function getDockerStatus(): Promise<DockerStatus> {
  const now = Date.now();
  if (dockerStatusCache && now - dockerStatusCache.at < DOCKER_STATUS_TTL_MS) {
    return dockerStatusCache.promise;
  }
  const promise = probeDocker();
  dockerStatusCache = { at: now, promise };
  return promise;
}

async function probeDocker(): Promise<DockerStatus> {
  const result = await runDockerCommand(
    ["version", "--format", "{{.Server.Version}}"],
    DOCKER_PROBE_TIMEOUT_MS
  );
  if (result.exitCode !== 0) return { available: false };
  const version = result.stdout.trim();
  if (!version) return { available: false };
  return { available: true, version };
}

// --- Per-image readiness (cached 5 min) ------------------------------------

const imageCache = new Map<string, { at: number; promise: Promise<boolean> }>();

export function imageReady(image: string): Promise<boolean> {
  const now = Date.now();
  const cached = imageCache.get(image);
  if (cached && now - cached.at < IMAGE_STATUS_TTL_MS) return cached.promise;

  const promise = runDockerCommand(
    ["image", "inspect", image],
    IMAGE_PROBE_TIMEOUT_MS
  ).then((result) => result.exitCode === 0);
  imageCache.set(image, { at: now, promise });
  return promise;
}

// --- Assembled capabilities -------------------------------------------------

export async function getCapabilities(): Promise<Capabilities> {
  const envKeys = Object.fromEntries(
    AI_PROVIDERS.map((p) => [p.id, Boolean(process.env[p.envKey]?.trim())]),
  ) as Capabilities["ai"]["envKeys"];

  const docker = await getDockerStatus();

  // Several languages share an image (gcc:14, node:22-alpine) — check each
  // unique image once, in parallel.
  const readyByImage = new Map<string, boolean>();
  if (docker.available) {
    const uniqueImages = [...new Set(LANGUAGES.map((l) => l.dockerImage))];
    const results = await Promise.all(uniqueImages.map((image) => imageReady(image)));
    uniqueImages.forEach((image, i) => readyByImage.set(image, results[i]));
  }

  const languages = {} as Capabilities["execution"]["languages"];
  for (const config of LANGUAGES) {
    let dockerState: DockerLanguageState;
    if (!docker.available) {
      dockerState = "unavailable";
    } else if (readyByImage.get(config.dockerImage)) {
      dockerState = "ready";
    } else {
      dockerState = "image-missing";
    }
    languages[config.id] = {
      docker: dockerState,
      browser: config.supportsBrowserExecution,
    };
  }

  const execution: Capabilities["execution"] = {
    docker: docker.available,
    languages,
  };
  if (docker.available && docker.version) {
    execution.dockerVersion = docker.version;
  }

  return { ai: { envKeys }, execution };
}
