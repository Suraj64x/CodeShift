import { getProviderInfo, type AIProviderId } from "@/lib/types";
import { anthropicProvider } from "./anthropic";
import { openAICompatProvider } from "./openai-compat";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";

const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openAICompatProvider("openai"),
  gemini: openAICompatProvider("gemini"),
  openrouter: openAICompatProvider("openrouter"),
};

export function getProvider(id: AIProviderId): AIProvider {
  return PROVIDERS[id];
}

/** API key for a request: the one typed into Settings (header), else .env.local. */
export function resolveKey(id: AIProviderId, headerKey: string | null): string {
  return headerKey?.trim() || process.env[getProviderInfo(id).envKey]?.trim() || "";
}

export function missingKeyMessage(id: AIProviderId): string {
  const { name, envKey } = getProviderInfo(id);
  return `No ${name} API key. Add one in Settings (or set ${envKey} in .env.local).`;
}
