import Anthropic from "@anthropic-ai/sdk";
import type { AIStreamEvent } from "@/lib/types";
import { TagStreamParser } from "./parse";
import { SYSTEM_PROMPT, buildConvertPrompt, buildFixPrompt } from "./prompts";
import type { AIProvider } from "./provider";

const MAX_OUTPUT_TOKENS = 32000;

const BAD_KEY_MESSAGE = "Anthropic rejected the API key. Check it in Settings.";

// Models that accept the server-side refusal fallback: if a safety classifier
// declines, the API retries on a fallback model inside the same call.
const FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

// Pre-4.6 models take neither adaptive thinking nor effort, so both are omitted.
// ponytail: name-pattern check, switch to the Models API capabilities if it drifts.
const LEGACY_MODEL = /^claude-(3|haiku-4|(opus|sonnet)-4-[0-5](-|$)|(opus|sonnet)-4-2)/;

export const anthropicProvider: AIProvider = {
  id: "anthropic",
  name: "Anthropic",

  convert(req, apiKey) {
    return streamCompletion(apiKey, req.model, buildConvertPrompt(req));
  },

  fix(req, apiKey) {
    return streamCompletion(apiKey, req.model, buildFixPrompt(req));
  },

  async listModels(apiKey) {
    try {
      const ids: string[] = [];
      for await (const model of new Anthropic({ apiKey }).models.list()) ids.push(model.id);
      return ids;
    } catch (error) {
      throw new Error(mapAnthropicError(error).message);
    }
  },
};

/**
 * Stream one conversion (or fix) from the Anthropic API, translating the raw
 * text stream into AIStreamEvents via the tag parser. All failures — API
 * errors, refusals, truncation — are yielded as `error` events, never thrown.
 *
 * Model quirks (do not "simplify" these):
 * - Claude 5 models reject `temperature`/`top_p` — never set them.
 * - Opus 5.5 defaults to effort "medium"; conversions want "high".
 */
async function* streamCompletion(
  apiKey: string,
  model: string,
  userMessage: string,
): AsyncGenerator<AIStreamEvent> {
  const parser = new TagStreamParser();
  try {
    const client = new Anthropic({ apiKey });
    const base = {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: userMessage }],
      ...(LEGACY_MODEL.test(model)
        ? {}
        : { thinking: { type: "adaptive" as const }, output_config: { effort: "high" as const } }),
    };

    const stream = FALLBACK_MODELS.has(model)
      ? client.beta.messages.stream({
          ...base,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : client.messages.stream(base);

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        for (const parsed of parser.feed(event.delta.text)) yield parsed;
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      const explanation = final.stop_details?.explanation;
      yield explanation
        ? {
            type: "error",
            message: "The model declined to convert this code.",
            detail: explanation,
          }
        : { type: "error", message: "The model declined to convert this code." };
      return;
    }

    if (final.stop_reason === "max_tokens") {
      yield { type: "error", message: "The conversion was too long and got cut off." };
      return;
    }

    yield { type: "done", ...parser.finish() };
  } catch (error) {
    yield mapAnthropicError(error);
  }
}

/** Map SDK exceptions to friendly, actionable error events. Most specific first. */
function mapAnthropicError(error: unknown): Extract<AIStreamEvent, { type: "error" }> {
  if (error instanceof Anthropic.AuthenticationError) {
    return { type: "error", message: BAD_KEY_MESSAGE };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      type: "error",
      message: "Rate limited by the Anthropic API. Wait a moment and try again.",
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return {
      type: "error",
      message: `The Anthropic API rejected the request: ${error.message}`,
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { type: "error", message: "Couldn't reach the Anthropic API. Check your network." };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      type: "error",
      message: `Anthropic API error (status ${error.status}): ${error.message}`,
    };
  }
  return {
    type: "error",
    message: "The conversion failed unexpectedly.",
    detail: error instanceof Error ? error.message : String(error),
  };
}
