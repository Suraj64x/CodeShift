import { getProviderInfo, type AIProviderId, type AIStreamEvent } from "@/lib/types";
import { TagStreamParser } from "./parse";
import { SYSTEM_PROMPT, buildConvertPrompt, buildFixPrompt } from "./prompts";
import type { AIProvider } from "./provider";

/**
 * Providers that speak the OpenAI Chat Completions wire format. Plain fetch +
 * SSE, no SDK. Base URLs are fixed here — the client only ever sends a
 * provider id, so a request can never point the server at an arbitrary host.
 */
type CompatId = Exclude<AIProviderId, "anthropic">;

const BASE_URLS: Record<CompatId, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export function openAICompatProvider(id: CompatId): AIProvider {
  const name = getProviderInfo(id).name;
  return {
    id,
    name,
    convert: (req, apiKey) => streamChat(id, apiKey, req.model, buildConvertPrompt(req)),
    fix: (req, apiKey) => streamChat(id, apiKey, req.model, buildFixPrompt(req)),
    async listModels(apiKey) {
      // OpenRouter's model list is public, so check the key explicitly.
      if (id === "openrouter") await request(id, apiKey, "/key");
      const res = await request(id, apiKey, "/models");
      const data = (await res.json()) as { data?: Array<{ id?: unknown }> };
      return (data.data ?? [])
        .map((m) => (typeof m.id === "string" ? m.id.replace(/^models\//, "") : ""))
        .filter(Boolean)
        .sort();
    },
  };
}

/** fetch against a provider; throws an Error with a user-facing message on failure. */
async function request(
  id: CompatId,
  apiKey: string,
  path: string,
  init?: { method: "POST"; body: string },
): Promise<Response> {
  const name = getProviderInfo(id).name;
  let res: Response;
  try {
    res = await fetch(BASE_URLS[id] + path, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new Error(`Couldn't reach ${name}. Check your network.`);
  }
  if (!res.ok) throw new Error(await errorMessage(name, res));
  return res;
}

async function errorMessage(name: string, res: Response): Promise<string> {
  let detail = "";
  try {
    // OpenAI/OpenRouter: {error:{message}}; Gemini sometimes wraps it in an array.
    const body = (await res.json()) as unknown;
    const first = Array.isArray(body) ? body[0] : body;
    const message = (first as { error?: { message?: unknown } } | null)?.error?.message;
    if (typeof message === "string") detail = message;
  } catch {
    // Non-JSON error body — fall back to the status code.
  }
  // Gemini answers a bad key with 400 + "API key" in the message, not 401.
  if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
    return `${name} rejected the API key. Check it in Settings.`;
  }
  if (res.status === 429) return `Rate limited by ${name}. Wait a moment and try again.`;
  return `${name} API error (status ${res.status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Stream one conversion (or fix) and translate the SSE text stream into
 * AIStreamEvents via the tag parser. Failures are yielded as `error` events,
 * never thrown. No max_tokens/temperature: newer models reject or rename them.
 */
async function* streamChat(
  id: CompatId,
  apiKey: string,
  model: string,
  userMessage: string,
): AsyncGenerator<AIStreamEvent> {
  const parser = new TagStreamParser();
  let finishReason: string | null = null;
  try {
    const res = await request(id, apiKey, "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.body) throw new Error(`${getProviderInfo(id).name} sent an empty response.`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        // Skip blank lines, SSE comments (": keep-alive") and the [DONE] marker.
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: {
          choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
          error?: { message?: unknown };
        };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.error) {
          throw new Error(
            typeof chunk.error.message === "string" ? chunk.error.message : "The stream failed.",
          );
        }
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (typeof text === "string" && text) {
          for (const event of parser.feed(text)) yield event;
        }
        if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
      }
    }

    if (finishReason === "length") {
      yield { type: "error", message: "The conversion was too long and got cut off." };
      return;
    }
    if (finishReason === "content_filter") {
      yield { type: "error", message: "The model declined to convert this code." };
      return;
    }
    yield { type: "done", ...parser.finish() };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "The conversion failed unexpectedly.",
    };
  }
}
