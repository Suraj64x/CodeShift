"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Minus,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, cx } from "@/components/ui";
import { compareOutputs } from "@/lib/compare";
import { buildReport, type CheckState } from "@/lib/report";
import type {
  ExecutionResult,
  LanguageConfig,
  VerificationResult,
  VerificationStatus,
} from "@/lib/types";

const STATE_META: Record<CheckState, { icon: LucideIcon; tone: string }> = {
  pass: { icon: Check, tone: "text-success" },
  warn: { icon: TriangleAlert, tone: "text-warn" },
  fail: { icon: X, tone: "text-danger" },
  skip: { icon: Minus, tone: "text-ink-mute" },
};

const STATUS_META: Record<VerificationStatus, { state: CheckState; text: string }> = {
  verified: { state: "pass", text: "Behavior verified" },
  partial: { state: "warn", text: "Converted, but not fully verified" },
  failed: { state: "fail", text: "Output mismatch" },
  unavailable: { state: "skip", text: "Verification unavailable" },
};

function StateIcon({ state, size }: { state: CheckState; size: number }) {
  const { icon: Icon, tone } = STATE_META[state];
  return <Icon size={size} strokeWidth={3} className={cx("shrink-0", tone)} aria-hidden="true" />;
}

function OutputColumn({
  title,
  run,
  text,
  diffLine,
}: {
  title: string;
  run: ExecutionResult;
  /** Normalized stdout for display */
  text: string;
  /** 0-based line to highlight on mismatch, or null */
  diffLine: number | null;
}) {
  const lines = text.split("\n");
  return (
    <div className="min-w-0">
      <span className="label">{title}</span>
      <pre className="mt-1.5 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-3.5 font-mono text-[13.5px] leading-relaxed text-ink-dim">
        {text === "" ? (
          <span className="text-ink-mute">(no output)</span>
        ) : (
          lines.map((line, index) => (
            <span
              key={index}
              className={
                diffLine === index
                  ? "rounded-sm bg-danger/10 text-danger"
                  : undefined
              }
            >
              {line}
              {index < lines.length - 1 ? "\n" : ""}
            </span>
          ))
        )}
      </pre>
      {run.truncated && (
        <p className="mt-1 text-[11.5px] text-ink-mute">Output truncated at 64 KB.</p>
      )}
      {run.stderr !== "" && run.exitCode !== 0 && (
        <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-3.5 font-mono text-[13px] text-danger/80">
          {run.stderr}
        </pre>
      )}
    </div>
  );
}

/** Native <details> disclosure styled as a quiet text toggle. */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-medium text-ink-dim transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          strokeWidth={2.5}
          className="transition-transform duration-200 group-open:rotate-90"
          aria-hidden="true"
        />
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

type VerificationPanelProps = {
  verification: VerificationResult | null;
  analysis: string;
  notes?: string;
  converting: boolean;
  onFix?: () => void;
  sourceLang: LanguageConfig;
  targetLang: LanguageConfig;
  /** Settings → "Open report collapsed" */
  defaultCollapsed?: boolean;
};

export default function VerificationPanel({
  verification,
  analysis,
  notes,
  converting,
  onFix,
  sourceLang,
  targetLang,
  defaultCollapsed = false,
}: VerificationPanelProps) {
  const sourceRun = verification?.sourceRun;
  const targetRun = verification?.targetRun;
  const comparison =
    sourceRun && targetRun
      ? compareOutputs(sourceRun.stdout, targetRun.stdout)
      : null;
  const diffLine =
    comparison && !comparison.match ? comparison.firstDiffLine : null;
  const meta = verification ? STATUS_META[verification.status] : null;
  const report = verification
    ? buildReport(verification, sourceLang.name, targetLang.name)
    : null;
  const attempts = verification?.attempts ?? [];
  // Collapsed = one slim verdict line, so the editors get the space back. Starts
  // from the Settings preference until the user toggles it.
  const [collapsedOverride, setCollapsed] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? defaultCollapsed;

  return (
    <>
      {converting && !verification && analysis !== "" && (
        <div className="shrink-0 border-t border-line px-5 py-2.5">
          <div className="flex items-baseline gap-3">
            <span className="label shrink-0">Analysis</span>
            <p className="line-clamp-2 min-w-0 font-mono text-[13.5px] leading-relaxed text-ink-dim">
              {analysis}
            </p>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {verification && meta && report && (
          <motion.div
            key="verification"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="shrink-0 overflow-hidden"
          >
            <section
              id="verification-report"
              aria-label="Verification report"
              className={cx(
                "max-h-[50vh] overflow-y-auto border-t border-line px-5 transition-[padding] duration-200",
                collapsed ? "py-2.5" : "py-5",
              )}
            >
              {/* Verdict */}
              <div className="flex items-start gap-x-4">
                <div className={cx("min-w-0 flex-1", collapsed && "flex items-center gap-3")}>
                  <h2
                    className={cx(
                      "flex shrink-0 items-center gap-2.5 font-semibold tracking-[-0.02em] text-ink",
                      collapsed ? "text-[16px]" : "text-[22px]",
                    )}
                  >
                    <StateIcon state={meta.state} size={collapsed ? 18 : 24} />
                    {meta.text}
                  </h2>
                  <p
                    className={cx(
                      "max-w-3xl text-[15px] leading-relaxed text-ink-dim",
                      collapsed ? "min-w-0 truncate text-[14px]" : "mt-1.5",
                    )}
                  >
                    {report.summary}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {verification.status === "failed" && onFix && !converting && (
                    <Button variant="ghost" size="sm" onClick={onFix}>
                      Try another fix
                    </Button>
                  )}
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => setCollapsed(!collapsed)}
                    aria-expanded={!collapsed}
                    aria-controls="verification-report"
                  >
                    {collapsed ? "Expand" : "Collapse"}
                    <ChevronDown
                      size={16}
                      strokeWidth={2.5}
                      className={cx("transition-transform duration-200", !collapsed && "rotate-180")}
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </div>

              {!collapsed && (
                <>
                  {/* One row per check */}
                  <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {report.rows.map((row) => (
                      <li key={row.label} className="flex min-w-0 items-center gap-2.5">
                        <StateIcon state={row.state} size={17} />
                        <span className="shrink-0 text-[14.5px] font-medium text-ink">
                          {row.label}
                        </span>
                        <span className="truncate font-mono text-[12.5px] text-ink-mute">
                          {row.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
    
                  {notes && (
                    <p className="mt-4 text-[13.5px] leading-relaxed text-ink-dim">
                      <span className="label mr-2">Note</span>
                      {notes}
                    </p>
                  )}
    
                  <div className="mt-4 flex flex-col gap-3">
                    {sourceRun && targetRun && comparison && (
                      <Disclosure title="Show both outputs">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <OutputColumn
                            title={`Original · ${sourceLang.name}`}
                            run={sourceRun}
                            text={comparison.source}
                            diffLine={diffLine}
                          />
                          <OutputColumn
                            title={`Converted · ${targetLang.name}`}
                            run={targetRun}
                            text={comparison.target}
                            diffLine={diffLine}
                          />
                        </div>
                      </Disclosure>
                    )}
                    {attempts.length > 0 && (
                      <Disclosure title="What the AI changed">
                        <ol className="flex flex-col gap-3">
                          {attempts.map((a) => (
                            <li key={a.attempt} className="flex gap-2.5">
                              <StateIcon state={a.matched ? "pass" : "fail"} size={16} />
                              <div className="min-w-0">
                                <span className="label">Attempt {a.attempt}</span>
                                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-dim">
                                  {a.diagnosis || "No diagnosis was given."}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </Disclosure>
                    )}
                  </div>
                </>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
