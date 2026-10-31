import { getProvider, missingKeyMessage, resolveKey } from "@/lib/ai";
import { guardRequest } from "@/lib/http/guards";
import { isLanguageId } from "@/lib/languages";
import { AI_KEY_HEADER, isModelName, isProviderId } from "@/lib/types";
import type {
  AIStreamEvent,
  FixRequestBody,
} from "@/lib/types";

/**
 * POST /api/ai/fix — body: FixRequestBody.
 * Same NDJSON stream contract as /api/ai/convert: one JSON AIStreamEvent per
 * line; HTTP 400 with { error } for invalid bodies; in-stream {"type":"error"}
 * events once streaming has started.
 */

const MAX_CODE_CHARS = 100_000;

function validateBody(raw: unknown): { body: FixRequestBody } | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "Request body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  if (!isLanguageId(b.sourceLanguage)) {
    return { error: "sourceLanguage is missing or not a supported language." };
  }
  if (!isLanguageId(b.targetLanguage)) {
    return { error: "targetLanguage is missing or not a supported language." };
  }
  if (typeof b.sourceCode !== "string" || b.sourceCode.trim() === "") {
    return { error: "sourceCode must be a non-empty string." };
  }
  if (b.sourceCode.length > MAX_CODE_CHARS) {
    return { error: "sourceCode is too large — the limit is 100,000 characters." };
  }
  if (typeof b.targetCode !== "string" || b.targetCode.trim() === "") {
    return { error: "targetCode must be a non-empty string." };
  }
  if (b.targetCode.length > MAX_CODE_CHARS) {
    return { error: "targetCode is too large — the limit is 100,000 characters." };
  }
  if (typeof b.sourceOutput !== "string") {
    return { error: "sourceOutput must be a string." };
  }
  if (typeof b.targetOutput !== "string") {
    return { error: "targetOutput must be a string." };
  }
  if (typeof b.targetStderr !== "string") {
    return { error: "targetStderr must be a string." };
  }
  if (typeof b.attempt !== "number" || !Number.isInteger(b.attempt) || b.attempt < 1) {
    return { error: "attempt must be a positive integer." };
  }

  if (!isProviderId(b.provider)) {
    return { error: "provider is missing or not a supported AI provider." };
  }
  if (!isModelName(b.model)) {
    return { error: "model is missing or not a valid model id." };
  }

  const body: FixRequestBody = {
    provider: b.provider,
    model: b.model,
    sourceLanguage: b.sourceLanguage,
    targetLanguage: b.targetLanguage,
    sourceCode: b.sourceCode,
    targetCode: b.targetCode,
    sourceOutput: b.sourceOutput,
    targetOutput: b.targetOutput,
    targetStderr: b.targetStderr,
    attempt: b.attempt,
  };
  return { body };
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validated = validateBody(raw);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const { body } = validated;
  const provider = getProvider(body.provider);
  const apiKey = resolveKey(body.provider, request.headers.get(AI_KEY_HEADER));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AIStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        if (!apiKey) {
          // A friendly in-stream error, not an HTTP 500 — the client pipeline
          // handles it exactly like any other AI failure.
          send({ type: "error", message: missingKeyMessage(body.provider) });
        } else {
          for await (const event of provider.fix(body, apiKey)) send(event);
        }
      } catch (error) {
        try {
          send({
            type: "error",
            message:
              error instanceof Error ? error.message : "The fix stream failed unexpectedly.",
          });
        } catch {
          // Client already disconnected — nothing left to notify.
        }
      }
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
