// POST /api/execute — run one program in the Docker sandbox and return an
// ExecutionResult. Program failures come back HTTP 200 with ok:false; sandbox
// problems set infraError; only an invalid request body is HTTP 400.

import { getCapabilities } from "@/lib/execution/capabilities";
import { executeInDocker } from "@/lib/execution/docker";
import { getLanguage, isLanguageId } from "@/lib/languages";
import { guardRequest } from "@/lib/http/guards";
import type { ExecuteRequestBody, ExecutionResult } from "@/lib/types";

const CODE_SIZE_LIMIT = 100_000;

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

function infraResult(infraError: string): ExecutionResult {
  return {
    ok: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    timedOut: false,
    truncated: false,
    durationMs: 0,
    environment: "docker",
    infraError,
  };
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) {
    return badRequest("Request body must be a JSON object.");
  }

  const body = raw as Partial<ExecuteRequestBody>;
  if (!isLanguageId(body.languageId)) {
    return badRequest("languageId is missing or not a supported language.");
  }
  if (typeof body.code !== "string") {
    return badRequest("code must be a string.");
  }
  if (body.code.length > CODE_SIZE_LIMIT) {
    return badRequest("code exceeds the 100,000 character limit.");
  }

  const headers = { "Cache-Control": "no-store" };

  const capabilities = await getCapabilities();
  const state = capabilities.execution.languages[body.languageId].docker;

  if (state !== "ready") {
    const image = getLanguage(body.languageId).dockerImage;
    const infraError =
      state === "unavailable"
        ? "Docker isn't available on this machine"
        : `Docker image ${image} isn't pulled yet — run: docker pull ${image}`;
    return Response.json(infraResult(infraError), { headers });
  }

  const result = await executeInDocker(body.languageId, body.code);
  return Response.json(result, { headers });
}
