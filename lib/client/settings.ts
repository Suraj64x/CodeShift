// App settings, persisted in localStorage (client-only, SSR-safe).
// Always merged over DEFAULT_SETTINGS so new fields get sane values.

import { isLanguageId } from "@/lib/languages";
import {
  AI_KEY_HEADER,
  AI_PROVIDERS,
  DEFAULT_SETTINGS,
  getProviderInfo,
  isModelName,
  isProviderId,
  type AIProviderId,
  type AppSettings,
} from "@/lib/types";

const STORAGE_KEY = "codeshift:settings:v1";

/** Keep only string entries for known providers that pass `valid`. */
function perProvider(
  raw: unknown,
  valid: (value: string) => boolean,
): Partial<Record<AIProviderId, string>> {
  const out: Partial<Record<AIProviderId, string>> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const { id } of AI_PROVIDERS) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === "string" && valid(value)) out[id] = value;
  }
  return out;
}

function sanitize(parsed: Partial<AppSettings>): AppSettings {
  // Stored values may predate the current fields/option lists — fall back per field.
  const d = DEFAULT_SETTINGS;
  const defaultSource = isLanguageId(parsed.defaultSource) ? parsed.defaultSource : d.defaultSource;
  let defaultTarget = isLanguageId(parsed.defaultTarget) ? parsed.defaultTarget : d.defaultTarget;
  if (defaultTarget === defaultSource) {
    defaultTarget = defaultSource === d.defaultTarget ? d.defaultSource : d.defaultTarget;
  }
  const fontSize = Number(parsed.editorFontSize);
  return {
    provider: isProviderId(parsed.provider) ? parsed.provider : d.provider,
    models: perProvider(parsed.models, isModelName),
    apiKeys: perProvider(parsed.apiKeys, (key) => key.trim() !== "" && key.length <= 500),
    fixAttempts: [0, 1, 2].includes(parsed.fixAttempts as number)
      ? (parsed.fixAttempts as AppSettings["fixAttempts"])
      : d.fixAttempts,
    editorFontSize: fontSize >= 12 && fontSize <= 20 ? Math.round(fontSize) : d.editorFontSize,
    tabSize: parsed.tabSize === 2 ? 2 : d.tabSize,
    wordWrap: typeof parsed.wordWrap === "boolean" ? parsed.wordWrap : d.wordWrap,
    minimap: typeof parsed.minimap === "boolean" ? parsed.minimap : d.minimap,
    lineNumbers: typeof parsed.lineNumbers === "boolean" ? parsed.lineNumbers : d.lineNumbers,
    reportCollapsed:
      typeof parsed.reportCollapsed === "boolean" ? parsed.reportCollapsed : d.reportCollapsed,
    defaultSource,
    defaultTarget,
  };
}

/** The model to use for the selected provider (its default when none was chosen). */
export function activeModel(settings: AppSettings): string {
  return settings.models[settings.provider] || getProviderInfo(settings.provider).models[0];
}

/** Headers for the AI routes: the key typed into Settings for `provider`, if any. */
export function aiHeaders(
  settings: AppSettings,
  provider: AIProviderId = settings.provider,
): Record<string, string> {
  const key = settings.apiKeys[provider]?.trim();
  return key ? { [AI_KEY_HEADER]: key } : {};
}

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }
    return sanitize(parsed as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  cache = s;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage full or unavailable — settings persistence is best-effort.
    }
  }
  emit();
}

// ---------------------------------------------------------------------------
// Subscription store (for useSyncExternalStore) — cached snapshot, notified on
// saves in this tab and on localStorage changes from other tabs.
// ---------------------------------------------------------------------------

let cache: AppSettings | null = null;
const listeners = new Set<() => void>();
let watchingStorage = false;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  if (!watchingStorage && typeof window !== "undefined") {
    watchingStorage = true;
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === STORAGE_KEY) {
        cache = null;
        emit();
      }
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSettingsSnapshot(): AppSettings {
  if (cache === null) cache = getSettings();
  return cache;
}

export function getServerSettingsSnapshot(): AppSettings {
  return DEFAULT_SETTINGS;
}
