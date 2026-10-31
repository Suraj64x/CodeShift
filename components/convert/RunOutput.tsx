"use client";

import { Check, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { IconButton, Spinner, cx } from "@/components/ui";
import type { ExecutionResult } from "@/lib/types";

export type RunState = {
  running: boolean;
  /** Last finished run (kept while a re-run is in flight) */
  result: ExecutionResult | null;
  /** The code that produced `result` — used to flag stale output */
  code: string;
  /** Progress from the runner while running, e.g. "Installing pygame-ce…" */
  status?: string;
};

function status(result: ExecutionResult): { icon: LucideIcon; tone: string; text: string } {
  const where = `${result.durationMs} ms · ${result.environment}`;
  if (result.infraError) return { icon: TriangleAlert, tone: "text-warn", text: result.infraError };
  if (result.timedOut) return { icon: X, tone: "text-danger", text: `Timed out · ${where}` };
  if (result.ok) return { icon: Check, tone: "text-success", text: `exit 0 · ${where}` };
  return { icon: X, tone: "text-danger", text: `exit ${result.exitCode ?? "?"} · ${where}` };
}

/** The run window under an editor: status line, stdout, stderr. */
export default function RunOutput({
  run,
  currentCode,
  onClose,
}: {
  run: RunState;
  currentCode: string;
  onClose: () => void;
}) {
  const { result } = run;
  const meta = result ? status(result) : null;
  const stale = !run.running && result !== null && run.code.trim() !== currentCode.trim();

  return (
    <section
      aria-label="Run output"
      className="anim-fade-up flex max-h-[45%] min-h-[96px] shrink-0 flex-col border-t border-line bg-base"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        <span className="label shrink-0">Output</span>
        <span role="status" aria-live="polite" className="flex min-w-0 items-center gap-1.5">
          {run.running ? (
            <>
              <Spinner size={13} />
              <span className="truncate text-[13px] text-ink-dim">{run.status ?? "Running…"}</span>
            </>
          ) : (
            meta && (
              <>
                <meta.icon
                  size={14}
                  strokeWidth={3}
                  className={cx("shrink-0", meta.tone)}
                  aria-hidden="true"
                />
                <span className="truncate font-mono text-[12.5px] text-ink-dim">{meta.text}</span>
              </>
            )
          )}
        </span>
        {stale && (
          <span className="hidden shrink-0 text-[12.5px] text-warn sm:inline">
            Code changed since this run
          </span>
        )}
        <IconButton label="Close output" onClick={onClose} className="ml-auto">
          <X size={15} />
        </IconButton>
      </div>
      <pre
        className={cx(
          "min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-dim transition-opacity duration-200",
          (run.running || stale) && "opacity-50",
        )}
      >
        {result === null ? (
          ""
        ) : result.stdout === "" && result.stderr === "" ? (
          <span className="text-ink-mute">(no output)</span>
        ) : (
          <>
            {result.stdout}
            {result.stderr !== "" && (
              <span className="text-danger/80">
                {result.stdout !== "" && !result.stdout.endsWith("\n") ? "\n" : ""}
                {result.stderr}
              </span>
            )}
          </>
        )}
        {result?.truncated && (
          <span className="mt-2 block text-[11.5px] text-ink-mute">Output truncated at 64 KB.</span>
        )}
      </pre>
    </section>
  );
}
