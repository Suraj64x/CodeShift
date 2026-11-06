"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { History as HistoryIcon, Trash2 } from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import { IconButton, cx } from "@/components/ui";
import { getLanguage } from "@/lib/languages";
import {
  clearHistory,
  deleteRecord,
  getHistorySnapshot,
  getServerHistorySnapshot,
  relativeTime,
  subscribeHistory,
} from "@/lib/client/history";
import type { VerificationStatus } from "@/lib/types";

const STATUS_META: Record<
  VerificationStatus,
  { glyph: string; color: string; word: string }
> = {
  verified: { glyph: "✓", color: "text-success", word: "Verified" },
  partial: { glyph: "△", color: "text-warn", word: "Partially verified" },
  failed: { glyph: "✕", color: "text-danger", word: "Mismatch" },
  unavailable: { glyph: "—", color: "text-ink-mute", word: "Unverified" },
};

export default function HistoryClient() {
  // The history store is hydration-safe: the server snapshot is empty, the
  // client snapshot reads localStorage, and mutations notify subscribers.
  const records = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getServerHistorySnapshot,
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const handleClearAll = useCallback(() => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    if (!confirmClear) {
      // Two-step confirm: first click arms it, reverts after 3 s.
      setConfirmClear(true);
      confirmTimer.current = window.setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearHistory();
    setConfirmClear(false);
  }, [confirmClear]);

  const handleDelete = useCallback((event: MouseEvent, id: string) => {
    // The delete button sits inside the row's Link — don't navigate.
    event.preventDefault();
    event.stopPropagation();
    deleteRecord(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-ink">
          History
        </h1>
        {records.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className={cx(
              "rounded-md px-2 py-1 text-[13.5px] transition-colors duration-150",
              confirmClear
                ? "text-danger"
                : "text-ink-mute hover:text-ink",
            )}
          >
            {confirmClear ? "Confirm clear" : "Clear all"}
          </button>
        )}
      </div>

      {records.length === 0 && (
        <div className="anim-fade-up flex flex-col items-center py-24 text-center">
          <HistoryIcon size={24} className="text-ink-mute" aria-hidden="true" />
          <p className="mt-3 text-[17px] font-medium text-ink">No conversions yet</p>
          <p className="mt-1 text-[14px] text-ink-mute">
            Convert something and it will be saved here automatically.
          </p>
          <Link
            href="/convert"
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-[15px] font-semibold text-[#0a0a0a] transition-all duration-150 hover:bg-white active:scale-[0.98]"
          >
            Open converter
          </Link>
        </div>
      )}

      {records.length > 0 && (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {records.map((record) => {
            const status = STATUS_META[record.verification];
            return (
              <li key={record.id}>
                <Link
                  href={`/convert?restore=${record.id}`}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-elevated/50"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "w-5 shrink-0 text-center font-mono text-[15px]",
                      status.color,
                    )}
                  >
                    {status.glyph}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-2 truncate text-[15px]">
                      <BrandIcon id={record.sourceLanguage} size={16} />
                      <span className="text-ink">
                        {getLanguage(record.sourceLanguage).name}
                      </span>
                      <span className="text-ink-mute">→</span>
                      <BrandIcon id={record.targetLanguage} size={16} />
                      <span className="truncate text-ink">
                        {getLanguage(record.targetLanguage).name}
                      </span>
                    </span>
                    <span className="truncate font-mono text-[12.5px] text-ink-mute">
                      {record.sourceCode.split("\n").find((line) => line.trim())?.trim()}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[13.5px] text-ink-dim sm:block">
                    {status.word}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[13px] text-ink-mute">
                      {relativeTime(record.createdAt)}
                    </span>
                    <IconButton
                      label="Delete conversion"
                      className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={(event) => handleDelete(event, record.id)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
