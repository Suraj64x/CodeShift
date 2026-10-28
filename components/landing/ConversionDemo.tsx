"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import BrandIcon from "@/components/BrandIcon";
import { cx } from "@/components/ui";

// Muted syntax palette — same hues as the convert page's editor theme.
const KEYWORD = "text-[#a793f6]";
const NUMBER = "text-[#d9b98a]";

type Segment = { text: string; className?: string };

const PYTHON_SEGMENTS: Segment[] = [
  { text: "numbers = [" },
  { text: "1", className: NUMBER },
  { text: ", " },
  { text: "2", className: NUMBER },
  { text: ", " },
  { text: "3", className: NUMBER },
  { text: "]\n" },
  { text: "print", className: KEYWORD },
  { text: "(" },
  { text: "sum", className: KEYWORD },
  { text: "(numbers))" },
];

const JS_SEGMENTS: Segment[] = [
  { text: "const", className: KEYWORD },
  { text: " numbers = [" },
  { text: "1", className: NUMBER },
  { text: ", " },
  { text: "2", className: NUMBER },
  { text: ", " },
  { text: "3", className: NUMBER },
  { text: "];\n" },
  { text: "console.log(numbers.reduce((a, b) => a + b, " },
  { text: "0", className: NUMBER },
  { text: "));" },
];

const JS_FULL_TEXT = JS_SEGMENTS.map((s) => s.text).join("");
const JS_TOTAL = JS_FULL_TEXT.length;

const TYPE_INTERVAL_MS = 28;
const HOLD_MS = 4000;
// Slightly longer than the 350ms opacity transition so the fade completes.
const FADE_MS = 450;

type Phase = "typing" | "hold" | "fading";

// prefers-reduced-motion as an external store: hydration-safe (false on the
// server) and reactive if the OS setting changes while the page is open.
function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function getReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getServerReducedMotion(): boolean {
  return false;
}

/** Render syntax-tinted segments, optionally cut off after `limit` characters. */
function renderSegments(segments: Segment[], limit?: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = limit ?? Number.POSITIVE_INFINITY;
  for (const seg of segments) {
    if (remaining <= 0) break;
    const text =
      seg.text.length > remaining ? seg.text.slice(0, remaining) : seg.text;
    remaining -= text.length;
    nodes.push(
      <span key={nodes.length} className={seg.className}>
        {text}
      </span>,
    );
  }
  return nodes;
}

export default function ConversionDemo() {
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  // Respect prefers-reduced-motion: skip the animation, show the final state.
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );

  // Phase machine: type → hold (footer visible) → fade out → restart. Typing
  // duration is deterministic, so completion is a scheduled timeout rather
  // than a state watcher.
  useEffect(() => {
    if (reduced) return;
    if (phase === "typing") {
      const interval = window.setInterval(() => {
        setTyped((t) => Math.min(t + 1, JS_TOTAL));
      }, TYPE_INTERVAL_MS);
      const done = window.setTimeout(
        () => setPhase("hold"),
        TYPE_INTERVAL_MS * (JS_TOTAL + 2),
      );
      return () => {
        window.clearInterval(interval);
        window.clearTimeout(done);
      };
    }
    if (phase === "hold") {
      const timer = window.setTimeout(() => setPhase("fading"), HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setTyped(0);
      setPhase("typing");
    }, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  const shownTyped = reduced ? JS_TOTAL : typed;
  const footerVisible = reduced || phase === "hold";

  return (
    <div
      role="img"
      aria-label="Demo: a two-line Python program is converted to JavaScript, both versions run, both print 6, and CodeShift confirms the output matches."
      className="anim-fade-up mx-auto mt-6 mb-20 max-w-[840px]"
    >
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-line bg-panel"
      >
        {/* Header strip */}
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center border-b border-line px-4">
          <span className="flex items-center gap-2">
            <BrandIcon id="python" size={15} />
            <span className="label">Python</span>
          </span>
          <span />
          <span className="flex items-center justify-end gap-2">
            <BrandIcon id="javascript" size={15} />
            <span className="label">JavaScript</span>
          </span>
        </div>

        {/* Body: source snippet → typed conversion */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr]">
          <div className="p-4 font-mono text-[14.5px] leading-7 whitespace-pre-wrap text-ink">
            {renderSegments(PYTHON_SEGMENTS)}
          </div>

          <div className="hidden select-none items-center justify-center px-2 text-ink-mute sm:flex">
            →
          </div>
          <div className="select-none py-0.5 text-center text-ink-mute sm:hidden">
            ↓
          </div>

          <div
            className={cx(
              "p-4 font-mono text-[14.5px] leading-7 text-ink transition-opacity duration-[350ms]",
              phase === "fading" && "opacity-0",
            )}
          >
            {/* Invisible full text reserves the final height so typing never
                shifts the layout; the typed text overlays it. */}
            <div className="relative whitespace-pre-wrap">
              <span className="invisible">{JS_FULL_TEXT}</span>
              <span className="absolute inset-0 whitespace-pre-wrap">
                {renderSegments(JS_SEGMENTS, shownTyped)}
                {!reduced && phase === "typing" && (
                  <span className="anim-caret inline-block h-[1.15em] w-[1ch] bg-ink align-text-bottom" />
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Footer strip: outputs + verdict, fades in once typing completes */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 border-t border-line px-4 py-3 font-mono text-[13.5px]">
          <span
            className={cx(
              "text-ink-dim transition-opacity duration-[350ms]",
              footerVisible ? "opacity-100" : "opacity-0",
            )}
          >
            6
          </span>
          <span
            className={cx(
              "text-success transition-opacity duration-[350ms]",
              footerVisible ? "opacity-100" : "opacity-0",
            )}
          >
            ✓ Output matches
          </span>
          <span
            className={cx(
              "text-right text-ink-dim transition-opacity duration-[350ms]",
              footerVisible ? "opacity-100" : "opacity-0",
            )}
          >
            6
          </span>
        </div>
      </div>
    </div>
  );
}
