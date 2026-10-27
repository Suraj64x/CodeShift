import { getProvider, missingKeyMessage, resolveKey } from "@/lib/ai";
import { guardRequest } from "@/lib/http/guards";
import { isLanguageId } from "@/lib/languages";
import { AI_KEY_HEADER, isModelName, isProviderId } from "@/lib/types";
import type {
  AIStreamEvent,
  ConvertRequestBody,
} from "@/lib/types";

/**
 * POST /api/ai/convert — body: ConvertRequestBody.
 * Responds with an NDJSON stream: one JSON AIStreamEvent per line.
 * Validation failures are HTTP 400 with { error }; once streaming, failures
 * are sent as a {"type":"error"} event and the stream ends.
 */

const MAX_CODE_CHARS = 100_000;

function validateBody(raw: unknown): { body: ConvertRequestBody } | { error: string } {
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
  if (b.sourceLanguage === b.targetLanguage) {
    return { error: "Source and target languages must be different." };
  }
  if (typeof b.sourceCode !== "string" || b.sourceCode.trim() === "") {
    return { error: "sourceCode must be a non-empty string." };
  }
  if (b.sourceCode.length > MAX_CODE_CHARS) {
    return { error: "sourceCode is too large — the limit is 100,000 characters." };
  }

  if (!isProviderId(b.provider)) {
    return { error: "provider is missing or not a supported AI provider." };
  }
  if (!isModelName(b.model)) {
    return { error: "model is missing or not a valid model id." };
  }

  const body: ConvertRequestBody = {
    provider: b.provider,
    model: b.model,
    sourceLanguage: b.sourceLanguage,
    targetLanguage: b.targetLanguage,
    sourceCode: b.sourceCode,
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
          for await (const event of provider.convert(body, apiKey)) send(event);
        }
      } catch (error) {
        try {
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "The conversion stream failed unexpectedly.",
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
