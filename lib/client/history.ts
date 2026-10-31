// Conversion history, persisted in localStorage (client-only, SSR-safe).
// Newest first, capped at 50 records.

import type { ConversionRecord } from "@/lib/types";
import { isLanguageId } from "@/lib/languages";

const STORAGE_KEY = "codeshift:history:v1";
const MAX_RECORDS = 50;

const VERIFICATION_STATUSES = ["verified", "partial", "failed", "unavailable"];

function isRecord(value: unknown): value is ConversionRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.createdAt === "number" &&
    isLanguageId(v.sourceLanguage) &&
    isLanguageId(v.targetLanguage) &&
    typeof v.sourceCode === "string" &&
    typeof v.targetCode === "string" &&
    typeof v.verification === "string" &&
    VERIFICATION_STATUSES.includes(v.verification) &&
    typeof v.verificationReason === "string"
  );
}

function readAll(): ConversionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function writeAll(records: ConversionRecord[]): void {
  cache = records;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Storage full or unavailable — history is best-effort, never crash the app.
    }
  }
  emit();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listHistory(): ConversionRecord[] {
  return readAll();
}

export function getRecord(id: string): ConversionRecord | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function saveRecord(
  r: Omit<ConversionRecord, "id" | "createdAt">,
): ConversionRecord {
  const record: ConversionRecord = { ...r, id: makeId(), createdAt: Date.now() };
  writeAll([record, ...readAll()].slice(0, MAX_RECORDS));
  return record;
}

export function deleteRecord(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function clearHistory(): void {
  cache = EMPTY_HISTORY;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort
    }
  }
  emit();
}

// ---------------------------------------------------------------------------
// Subscription store (for useSyncExternalStore) — cached snapshot, notified on
// mutations in this tab and on localStorage changes from other tabs.
// ---------------------------------------------------------------------------

const EMPTY_HISTORY: ConversionRecord[] = [];
let cache: ConversionRecord[] | null = null;
const listeners = new Set<() => void>();
let watchingStorage = false;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeHistory(listener: () => void): () => void {
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

export function getHistorySnapshot(): ConversionRecord[] {
  if (cache === null) cache = readAll();
  return cache;
}

export function getServerHistorySnapshot(): ConversionRecord[] {
  return EMPTY_HISTORY;
}

/** Human-friendly relative timestamp, e.g. "2 minutes ago", "3 days ago". */
export function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return ago(seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return ago(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ago(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return ago(days, "day");
  if (days < 30) return ago(Math.floor(days / 7), "week");
  if (days < 365) return ago(Math.floor(days / 30), "month");
  return ago(Math.floor(days / 365), "year");
}

function ago(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
