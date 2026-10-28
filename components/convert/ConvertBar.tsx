"use client";

import { ArrowRight, Check } from "lucide-react";
import { Button, Spinner, cx } from "@/components/ui";
import type { Capabilities, LanguageId, PipelineStageId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Stage progress
// ---------------------------------------------------------------------------

const STAGES: Array<{ id: PipelineStageId; label: string }> = [
  { id: "analyze", label: "Analyze" },
  { id: "generate", label: "Generate" },
  { id: "validate", label: "Validate" },
  { id: "execute", label: "Execute" },
  { id: "compare", label: "Compare" },
];

type ChipStatus = "pending" | "active" | "done";

function StageChip({ label, status }: { label: string; status: ChipStatus }) {
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.14em]",
        "transition-colors duration-150",
        status === "pending" && "text-ink-mute/60",
        status === "active" && "text-ink",
        status === "done" && "text-ink-mute",
      )}
    >
      {status === "active" && (
        <span
          className="h-1 w-1 rounded-full bg-accent anim-pulse-soft"
          aria-hidden="true"
        />
      )}
      {status === "done" && <Check size={10} aria-hidden="true" />}
      {label}
    </span>
  );
}

function StageProgress({
  stage,
  fixAttempt,
}: {
  stage: PipelineStageId | null;
  fixAttempt: number;
}) {
  const fixing = stage === "fix";
  const activeIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <ol className="flex items-center gap-3" aria-label="Conversion progress">
      {STAGES.map((s, index) => {
        const status: ChipStatus = fixing
          ? "done"
          : index === activeIndex
            ? "active"
            : index < activeIndex
              ? "done"
              : "pending";
        return (
          <li key={s.id}>
            <StageChip label={s.label} status={status} />
          </li>
        );
      })}
      {fixAttempt > 0 && (
        <li>
          <StageChip label={`Fix ${fixAttempt}`} status={fixing ? "active" : "done"} />
        </li>
      )}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Capability note ("Verification: Docker off · Python, JS, TS run in your browser")
// ---------------------------------------------------------------------------

const SHORT_NAMES: Partial<Record<LanguageId, string>> = {
  python: "Python",
  javascript: "JS",
  typescript: "TS",
};

function capabilityNote(caps: Capabilities): string {
  const langs = caps.execution.languages;
  const ids = Object.keys(langs) as LanguageId[];
  const browserNames = ids
    .filter((id) => langs[id].browser)
    .map((id) => SHORT_NAMES[id] ?? id);
  const browserPart =
    browserNames.length > 0
      ? `${browserNames.join(", ")} run in your browser`
      : "no execution available";

  if (!caps.execution.docker) {
    return `Verification: Docker off · ${browserPart}`;
  }

  const missingImages = ids.filter((id) => langs[id].docker === "image-missing").length;
  const version = caps.execution.dockerVersion
    ? ` (v${caps.execution.dockerVersion})`
    : "";
  let note = `Verification: Docker on${version}`;
  if (missingImages > 0) {
    note += ` · ${missingImages} image${missingImages === 1 ? "" : "s"} not pulled`;
  }
  return note;
}

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

type ConvertBarProps = {
  state: "idle" | "converting" | "done" | "error";
  stage: PipelineStageId | null;
  fixAttempt: number;
  errorMessage: string | null;
  capabilities: Capabilities | null;
  capsLoading: boolean;
  capsError: boolean;
  onRetryCapabilities: () => void;
  canConvert: boolean;
  onConvert: () => void;
};

export default function ConvertBar({
  state,
  stage,
  fixAttempt,
  errorMessage,
  capabilities,
  capsLoading,
  capsError,
  onRetryCapabilities,
  canConvert,
  onConvert,
}: ConvertBarProps) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-t border-line px-5">
      <div
        role="status"
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center overflow-x-auto text-[13.5px] text-ink-dim"
      >
        {state === "converting" ? (
          <StageProgress stage={stage} fixAttempt={fixAttempt} />
        ) : state === "error" && errorMessage ? (
          <span className="flex min-w-0 items-center gap-2 text-danger">
            <span className="font-mono" aria-hidden="true">
              ✕
            </span>
            <span className="truncate" title={errorMessage}>
              {errorMessage}
            </span>
          </span>
        ) : capsLoading ? (
          <span className="flex items-center gap-2 text-ink-mute">
            <Spinner size={13} />
            {"Checking environment…"}
          </span>
        ) : capsError ? (
          <span className="flex items-center gap-2">
            <span className="font-mono text-warn" aria-hidden="true">
              △
            </span>
            <span>{"Couldn't check the execution environments."}</span>
            <button
              type="button"
              onClick={onRetryCapabilities}
              className="text-ink underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              Retry
            </button>
          </span>
        ) : capabilities ? (
          <span className="truncate text-ink-mute" title={capabilityNote(capabilities)}>
            {capabilityNote(capabilities)}
          </span>
        ) : null}
      </div>

      <Button variant="primary" onClick={onConvert} disabled={!canConvert}>
        Convert
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
