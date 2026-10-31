"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button, IconButton, Spinner, cx } from "@/components/ui";
import { transpileTypeScript } from "@/lib/client/browser-exec";
import { buildPlayDocument, PLAY_MESSAGE } from "@/lib/play";
import type { LanguageConfig } from "@/lib/types";

type ConsoleLine = { stream: "stdout" | "stderr"; text: string };

/**
 * Modal that plays a graphical JavaScript/TypeScript program on a canvas inside
 * a sandboxed, network-less iframe (see lib/play.ts).
 */
export default function PlayWindow({
  code,
  language,
  onClose,
}: {
  code: string;
  language: LanguageConfig;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // TypeScript is compiled by the TS worker first; JavaScript plays as-is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let js = code;
      if (language.id === "typescript") {
        const out = await transpileTypeScript(code);
        if (cancelled) return;
        if ("error" in out) {
          setError(out.error);
          return;
        }
        js = out.js;
      }
      setDoc(buildPlayDocument(js));
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language.id]);

  // Console relay — only from our own iframe, only our message shape.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: unknown; stream?: unknown; text?: unknown } | null;
      if (data?.source !== PLAY_MESSAGE || typeof data.text !== "string") return;
      const line: ConsoleLine = {
        stream: data.stream === "stderr" ? "stderr" : "stdout",
        text: data.text.slice(0, 2000),
      };
      setLines((current) => [...current.slice(-199), line]);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function restart() {
    setLines([]);
    setRunKey((k) => k + 1);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={`Play ${language.name} program`}
      className="m-auto w-[min(92vw,760px)] overflow-hidden rounded-xl border border-line bg-panel p-0 text-ink backdrop:bg-black/70"
    >
      <div className="flex h-11 items-center justify-between border-b border-line pl-4 pr-2">
        <span className="label">Play · {language.name}</span>
        <div className="flex items-center gap-1">
          <Button variant="subtle" size="sm" onClick={restart} disabled={doc === null}>
            <RotateCcw size={14} strokeWidth={2.5} aria-hidden="true" />
            Restart
          </Button>
          <IconButton label="Close" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <div className="relative h-[min(68vh,640px)] bg-black">
        {doc !== null && (
          <iframe
            key={runKey}
            ref={frameRef}
            title={`${language.name} program`}
            sandbox="allow-scripts"
            srcDoc={doc}
            onLoad={() => frameRef.current?.focus()}
            className="block h-full w-full border-0"
          />
        )}
        {doc === null && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-ink-dim">
            {error === null ? (
              <>
                <Spinner /> Preparing…
              </>
            ) : (
              <pre className="max-w-[90%] whitespace-pre-wrap font-mono text-[13px] text-danger/80">
                {error}
              </pre>
            )}
          </div>
        )}
      </div>

      <pre
        aria-label="Console output"
        className="max-h-28 min-h-10 overflow-auto whitespace-pre-wrap border-t border-line px-4 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink-dim"
      >
        {lines.length === 0 ? (
          <span className="text-ink-mute">
            Click the game, then use your keyboard. Runs sandboxed: no internet, no access to this site.
          </span>
        ) : (
          lines.map((line, i) => (
            <span key={i} className={cx("block", line.stream === "stderr" && "text-danger/80")}>
              {line.text}
            </span>
          ))
        )}
      </pre>
    </dialog>
  );
}
