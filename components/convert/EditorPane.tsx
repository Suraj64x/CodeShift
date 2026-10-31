"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { Braces, Check, Copy, Download, Eraser, Play } from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import { IconButton, Spinner } from "@/components/ui";
import { DEFAULT_SETTINGS, type AppSettings, type LanguageConfig } from "@/lib/types";

export type EditorPrefs = Pick<
  AppSettings,
  "editorFontSize" | "tabSize" | "wordWrap" | "minimap" | "lineNumbers"
>;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-panel anim-pulse-soft" aria-hidden="true" />
  ),
});

type MonacoEditorInstance = Parameters<OnMount>[0];

// Define the theme once per Monaco instance, not once per pane.
let themeDefined = false;

const handleBeforeMount: BeforeMount = (monaco) => {
  if (themeDefined) return;
  themeDefined = true;
  monaco.editor.defineTheme("codeshift", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "a793f6" },
      { token: "string", foreground: "86d3ae" },
      { token: "number", foreground: "d9b98a" },
      { token: "comment", foreground: "4b4b54" },
      { token: "type", foreground: "8ab4d8" },
      { token: "delimiter", foreground: "9b9ba4" },
      { token: "operator", foreground: "9b9ba4" },
      { token: "identifier", foreground: "d4d4d8" },
    ],
    colors: {
      "editor.background": "#0e0e11",
      "editor.lineHighlightBackground": "#0e0e11",
      "editorLineNumber.foreground": "#3f3f46",
      "editorLineNumber.activeForeground": "#71717a",
      "editor.selectionBackground": "#ffffff1a",
      "editorIndentGuide.background1": "#1c1c21",
    },
  });
};

type EditorPaneProps = {
  label: string;
  language: LanguageConfig;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  streaming?: boolean;
  onLoadSample?: () => void;
  emptyHint?: string;
  /** Editor preferences from Settings (font size, tabs, wrap, minimap, line numbers) */
  prefs?: EditorPrefs;
  /** Show a Run button; `runDisabled` is the reason it can't run (null = can run) */
  onRun?: () => void;
  runDisabled?: string | null;
  running?: boolean;
  /** Run button text, e.g. "Play" for graphical programs */
  runLabel?: string;
  /** Rendered under the editor (the run window) */
  children?: ReactNode;
};

export default function EditorPane({
  label,
  language,
  value,
  onChange,
  readOnly = false,
  streaming = false,
  onLoadSample,
  emptyHint,
  prefs = DEFAULT_SETTINGS,
  onRun,
  runDisabled = null,
  running = false,
  runLabel = "Run",
  children,
}: EditorPaneProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  // Monaco can't read CSS variables itself — resolve the mono font at mount.
  const [monoFont] = useState(() => {
    if (typeof document === "undefined") return "ui-monospace, monospace";
    const fromVar = getComputedStyle(document.body)
      .getPropertyValue("--font-geist-mono")
      .trim();
    return fromVar || "ui-monospace, monospace";
  });

  // Monaco only has built-in formatters for JavaScript/TypeScript.
  const canFormat =
    !readOnly && (language.id === "javascript" || language.id === "typescript");

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Follow the stream: keep the newest line in view while code arrives.
  useEffect(() => {
    if (!streaming) return;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (editor && model) editor.revealLine(model.getLineCount());
  }, [value, streaming]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
  }

  function handleDownload() {
    const blob = new Blob([value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = language.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleFormat() {
    void editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2">
          <BrandIcon id={language.id} size={15} />
          <span className="label">{label}</span>
        </span>
        <div className="flex items-center gap-0.5">
          {onRun && (
            <button
              type="button"
              onClick={runDisabled === null && !running ? onRun : undefined}
              aria-disabled={runDisabled !== null || running}
              title={runDisabled ?? `${runLabel} ${language.fileName}`}
              className="mr-1.5 inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] font-semibold text-ink transition-colors duration-150 hover:border-line-strong hover:bg-elevated aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-line aria-disabled:hover:bg-transparent"
            >
              {running ? (
                <Spinner size={13} />
              ) : (
                <Play size={13} strokeWidth={2.5} className="fill-success text-success" aria-hidden="true" />
              )}
              {runLabel}
            </button>
          )}
          {onLoadSample && !readOnly && value.trim() === "" && (
            <button
              type="button"
              onClick={onLoadSample}
              className="mr-1 rounded-md px-2 py-1 text-[13px] text-ink-dim transition-colors duration-150 hover:bg-elevated hover:text-ink"
            >
              Sample
            </button>
          )}
          <IconButton
            label={copied ? "Copied" : "Copy code"}
            onClick={handleCopy}
            disabled={value === ""}
          >
            {copied ? (
              <Check size={15} className="text-success" />
            ) : (
              <Copy size={15} />
            )}
          </IconButton>
          <IconButton
            label={`Download ${language.fileName}`}
            onClick={handleDownload}
            disabled={value === ""}
          >
            <Download size={15} />
          </IconButton>
          <IconButton
            label="Format code"
            onClick={handleFormat}
            disabled={!canFormat || value === ""}
          >
            <Braces size={15} />
          </IconButton>
          {onChange && !readOnly && (
            <IconButton
              label="Clear code"
              onClick={() => onChange("")}
              disabled={value === ""}
            >
              <Eraser size={15} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {readOnly && !streaming && value === "" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="text-[14px] text-ink-mute">
              {emptyHint ?? "Converted code appears here"}
            </p>
          </div>
        )}
        <MonacoEditor
          language={language.monacoLanguage}
          value={value}
          theme="codeshift"
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={(next) => onChange?.(next ?? "")}
          loading={
            <div className="h-full w-full bg-panel anim-pulse-soft" aria-hidden="true" />
          }
          options={{
            readOnly,
            fontSize: prefs.editorFontSize,
            lineHeight: Math.round(prefs.editorFontSize * 1.6),
            fontFamily: monoFont,
            minimap: { enabled: prefs.minimap },
            lineNumbers: prefs.lineNumbers ? "on" : "off",
            scrollBeyondLastLine: false,
            renderLineHighlight: "none",
            overviewRulerLanes: 0,
            folding: false,
            lineNumbersMinChars: 3,
            padding: { top: 16, bottom: 16 },
            smoothScrolling: true,
            cursorBlinking: "phase",
            automaticLayout: true,
            tabSize: prefs.tabSize,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            wordWrap: prefs.wordWrap ? "on" : "off",
            contextmenu: false,
          }}
        />
      </div>
      {children}
    </div>
  );
}
