"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

import ConvertBar from "@/components/convert/ConvertBar";
import EditorPane from "@/components/convert/EditorPane";
import LanguageSelect from "@/components/convert/LanguageSelect";
import PlayWindow from "@/components/convert/PlayWindow";
import RunOutput, { type RunState } from "@/components/convert/RunOutput";
import VerificationPanel from "@/components/convert/VerificationPanel";
import BrandIcon from "@/components/BrandIcon";
import { IconButton } from "@/components/ui";
import { useShortcuts } from "@/hooks/useShortcuts";
import { canRunInBrowser, warmBrowserRuntime } from "@/lib/client/browser-exec";
import { getRecord, saveRecord } from "@/lib/client/history";
import {
  fetchCapabilities,
  runFixCycle,
  runPipeline,
  runCode,
  runUnavailableReason,
  type PipelineInput,
} from "@/lib/client/pipeline";
import {
  activeModel,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
} from "@/lib/client/settings";
import { getLanguage, isGraphical, isLanguageId, isPlayable, LANGUAGES } from "@/lib/languages";
import {
  getProviderInfo,
  type Capabilities,
  type LanguageId,
  type PipelineEvent,
  type PipelineStageId,
  type VerificationResult,
} from "@/lib/types";

type UiState = "idle" | "converting" | "done" | "error";
type RunSide = "source" | "target";

/** Untouched content — empty or exactly one of the built-in samples. */
function isPristine(code: string): boolean {
  const trimmed = code.trim();
  return trimmed === "" || LANGUAGES.some((lang) => lang.sample.trim() === trimmed);
}

// The unconverted draft survives leaving the page (e.g. "Add it in Settings")
// for the rest of the tab's session.
const DRAFT_KEY = "codeshift:draft";
type Draft = { sourceLanguage: LanguageId; targetLanguage: LanguageId; sourceCode: string };

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    if (d && isLanguageId(d.sourceLanguage) && isLanguageId(d.targetLanguage) && typeof d.sourceCode === "string") {
      return d as Draft;
    }
  } catch {
    // Unavailable or corrupt — start fresh.
  }
  return null;
}

// Platform detection as a client-only external-store snapshot: the server
// renders the Ctrl variant, the client corrects to ⌘ without a hydration error.
const subscribeNever = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad/i.test(navigator.platform);
const getServerIsMac = () => false;

export default function ConvertClient() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [sourceLanguage, setSourceLanguage] = useState<LanguageId>("python");
  const [targetLanguage, setTargetLanguage] = useState<LanguageId>("javascript");
  const [sourceCode, setSourceCode] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [notes, setNotes] = useState<string | undefined>(undefined);
  const [state, setState] = useState<UiState>("idle");
  const [stage, setStage] = useState<PipelineStageId | null>(null);
  const [fixAttempt, setFixAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [capsLoading, setCapsLoading] = useState(true);
  const [capsError, setCapsError] = useState(false);
  const [capsReload, setCapsReload] = useState(0);
  // Run windows under each editor (Run button, or filled in by verification).
  const [runs, setRuns] = useState<Partial<Record<RunSide, RunState>>>({});
  const runAbortRef = useRef<Partial<Record<RunSide, AbortController>>>({});
  // Side whose graphical program is open in the Play window.
  const [playSide, setPlaySide] = useState<RunSide | null>(null);

  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  const isMac = useSyncExternalStore(subscribeNever, getIsMac, getServerIsMac);

  // Streaming buffers, flushed to state at most once per animation frame so
  // rapid code deltas don't overwhelm React/Monaco.
  const targetBufRef = useRef("");
  const analysisBufRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoreHandledRef = useRef(false);

  const searchParams = useSearchParams();
  const restoreId = searchParams.get("restore");

  // -------------------------------------------------------------------------
  // Streaming flush helpers
  // -------------------------------------------------------------------------
  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTargetCode(targetBufRef.current);
      setAnalysis(analysisBufRef.current);
    });
  }, []);

  const flushNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setTargetCode(targetBufRef.current);
    setAnalysis(analysisBufRef.current);
  }, []);

  // -------------------------------------------------------------------------
  // Mount effects
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetchCapabilities()
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch(() => {
        if (!cancelled) setCapsError(true);
      })
      .finally(() => {
        if (!cancelled) setCapsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [capsReload]);

  const retryCapabilities = useCallback(() => {
    setCapsLoading(true);
    setCapsError(false);
    setCapabilities(null);
    setCapsReload((n) => n + 1);
  }, []);

  // /convert?restore=<id> — load a history record into both editors.
  useEffect(() => {
    if (!restoreId || restoreHandledRef.current) return;
    restoreHandledRef.current = true;
    const record = getRecord(restoreId);
    if (!record) return;
    // One-shot init from the URL + localStorage. This must run post-mount:
    // localStorage doesn't exist during SSR, so initializing state during
    // render would make the server and client HTML disagree.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSourceLanguage(record.sourceLanguage);
    setTargetLanguage(record.targetLanguage);
    setSourceCode(record.sourceCode);
    targetBufRef.current = record.targetCode;
    setTargetCode(record.targetCode);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [restoreId]);

  // Open with this tab's draft, else the default pair from Settings and its
  // sample (unless restoring history).
  useEffect(() => {
    if (restoreId) return;
    const { defaultSource, defaultTarget } = getSettingsSnapshot();
    const draft = readDraft();
    // Post-mount for the same reason as the restore effect above.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSourceLanguage(draft?.sourceLanguage ?? defaultSource);
    setTargetLanguage(draft?.targetLanguage ?? defaultTarget);
    setSourceCode(draft?.sourceCode ?? getLanguage(defaultSource).sample);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Declared after the load above so the first write can't clobber the draft.
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ sourceLanguage, targetLanguage, sourceCode }));
    } catch {
      // best-effort
    }
  }, [sourceLanguage, targetLanguage, sourceCode]);

  // Warm browser runtimes (e.g. start the Pyodide download) for languages that
  // would actually execute in the browser.
  useEffect(() => {
    if (!capabilities) return;
    for (const lang of [sourceLanguage, targetLanguage]) {
      const langState = capabilities.execution.languages[lang];
      if (
        langState &&
        langState.docker !== "ready" &&
        langState.browser &&
        canRunInBrowser(lang)
      ) {
        warmBrowserRuntime(lang);
      }
    }
  }, [capabilities, sourceLanguage, targetLanguage]);

  // Abort any in-flight run and cancel pending flushes on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Pipeline event handling
  // -------------------------------------------------------------------------
  function applyEvent(event: PipelineEvent) {
    switch (event.type) {
      case "stage": {
        setStage(event.stage);
        if (event.stage === "fix") {
          const parsed = /(\d+)/.exec(event.detail ?? "");
          if (parsed) setFixAttempt(Number(parsed[1]));
          else setFixAttempt((n) => n + 1);
          // Let the fix diagnosis stream fresh instead of appending.
          analysisBufRef.current = "";
          scheduleFlush();
        }
        break;
      }
      case "analysis-delta":
        analysisBufRef.current += event.text;
        scheduleFlush();
        break;
      case "code-delta":
        targetBufRef.current += event.text;
        scheduleFlush();
        break;
      case "code-reset":
        targetBufRef.current = "";
        flushNow();
        break;
      case "execution":
        // Verification runs double as the run windows' output — no extra run.
        setRuns((r) => ({
          ...r,
          [event.side]: {
            running: false,
            result: event.result,
            code: event.side === "source" ? sourceCode : targetBufRef.current,
          },
        }));
        break;
      case "done": {
        targetBufRef.current = event.outcome.targetCode;
        flushNow();
        if (event.outcome.notes !== undefined) setNotes(event.outcome.notes);
        setVerification(event.outcome.verification);
        setStage(null);
        setState("done");
        try {
          saveRecord({
            sourceLanguage,
            targetLanguage,
            sourceCode,
            targetCode: event.outcome.targetCode,
            verification: event.outcome.verification.status,
            verificationReason: event.outcome.verification.reason,
            ...(event.outcome.notes !== undefined
              ? { notes: event.outcome.notes }
              : {}),
          });
        } catch {
          // localStorage unavailable — the conversion itself still succeeded.
        }
        break;
      }
      case "error":
        flushNow();
        setErrorMessage(event.message);
        setStage(null);
        setState("error");
        break;
    }
  }

  async function consume(
    generator: AsyncGenerator<PipelineEvent>,
    controller: AbortController,
    apply: (event: PipelineEvent) => void,
  ) {
    try {
      for await (const event of generator) {
        if (controller.signal.aborted) return;
        apply(event);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(
        err instanceof Error && err.message ? err.message : "Something went wrong.",
      );
      setStage(null);
      setState("error");
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const canConvert =
    state !== "converting" &&
    capabilities !== null &&
    sourceCode.trim().length > 0 &&
    sourceLanguage !== targetLanguage;

  function handleConvert() {
    if (!canConvert || !capabilities) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    targetBufRef.current = "";
    analysisBufRef.current = "";
    flushNow();
    setNotes(undefined);
    setVerification(null);
    setErrorMessage(null);
    setFixAttempt(0);
    setStage("analyze");
    setState("converting");
    runAbortRef.current.target?.abort();
    setRuns((r) => ({ source: r.source }));

    const input: PipelineInput = {
      sourceLanguage,
      targetLanguage,
      sourceCode,
      settings,
      capabilities,
    };
    void consume(runPipeline(input, controller.signal), controller, applyEvent);
  }

  function handleFix() {
    if (state === "converting" || !capabilities || !verification) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const previous = { targetCode: targetBufRef.current, verification };
    analysisBufRef.current = "";
    flushNow();
    setVerification(null);
    setErrorMessage(null);
    setFixAttempt(verification.fixAttempts + 1);
    setStage("fix");
    setState("converting");

    const input: PipelineInput = {
      sourceLanguage,
      targetLanguage,
      sourceCode,
      settings,
      capabilities,
    };
    void consume(runFixCycle(input, previous, controller.signal), controller, applyEvent);
  }

  /** Drop any previous outcome — used when languages change or code is edited. */
  function resetOutcome() {
    abortRef.current?.abort();
    targetBufRef.current = "";
    analysisBufRef.current = "";
    flushNow();
    setNotes(undefined);
    setVerification(null);
    setErrorMessage(null);
    setFixAttempt(0);
    setStage(null);
    setState("idle");
    runAbortRef.current.source?.abort();
    runAbortRef.current.target?.abort();
    setRuns({});
  }

  // Why a side's Run button is disabled, or null when it can run.
  function sideOf(side: RunSide) {
    return side === "source"
      ? { language: sourceLanguage, code: sourceCode }
      : { language: targetLanguage, code: targetCode };
  }

  function runBlocked(side: RunSide): string | null {
    const { language, code } = sideOf(side);
    if (side === "target" && state === "converting") return "Wait for the conversion to finish.";
    if (code.trim() === "") return "Nothing to run yet.";
    if (isPlayable(language, code)) return null;
    if (isGraphical(language, code)) {
      return "Graphical program: only JavaScript and TypeScript can be played here. Convert it to one of those to play it.";
    }
    if (!capabilities) {
      return capsLoading ? "Checking what can run here…" : "Couldn't check what can run here.";
    }
    return runUnavailableReason(language, capabilities);
  }

  async function handleRun(side: RunSide) {
    if (runBlocked(side) !== null) return;
    const target = sideOf(side);
    if (isPlayable(target.language, target.code)) {
      setPlaySide(side);
      return;
    }
    if (!capabilities) return;
    const code = side === "source" ? sourceCode : targetBufRef.current;
    const language = side === "source" ? sourceLanguage : targetLanguage;
    runAbortRef.current[side]?.abort();
    const controller = new AbortController();
    runAbortRef.current[side] = controller;
    setRuns((r) => ({ ...r, [side]: { running: true, result: r[side]?.result ?? null, code } }));
    const result = await runCode(language, code, capabilities, controller.signal, (status) => {
      if (!controller.signal.aborted) {
        setRuns((r) => (r[side]?.running ? { ...r, [side]: { ...r[side], status } } : r));
      }
    });
    if (controller.signal.aborted) return;
    setRuns((r) => ({ ...r, [side]: { running: false, result, code } }));
  }

  function closeRun(side: RunSide) {
    runAbortRef.current[side]?.abort();
    setRuns((r) => ({ ...r, [side]: undefined }));
  }

  function handleSourceLanguageChange(id: LanguageId) {
    if (id === sourceLanguage) return;
    resetOutcome();
    setSourceCode((code) => (isPristine(code) ? getLanguage(id).sample : code));
    setSourceLanguage(id);
  }

  function handleTargetLanguageChange(id: LanguageId) {
    if (id === targetLanguage) return;
    resetOutcome();
    setTargetLanguage(id);
  }

  function handleSwap() {
    const previousTargetCode = targetBufRef.current;
    const previousSource = sourceLanguage;
    const previousTarget = targetLanguage;
    resetOutcome();
    setSourceLanguage(previousTarget);
    setTargetLanguage(previousSource);
    if (previousTargetCode.trim() !== "") {
      setSourceCode(previousTargetCode);
    } else {
      setSourceCode((code) =>
        isPristine(code) ? getLanguage(previousTarget).sample : code,
      );
    }
  }

  function handleSourceChange(next: string) {
    setSourceCode(next);
    // Editing the source invalidates any previous result — never show a
    // "verified" claim next to code that wasn't the code we verified.
    if (state === "done" || state === "error") {
      setVerification(null);
      setErrorMessage(null);
      setStage(null);
      setState("idle");
    }
  }

  useShortcuts([
    { combo: "mod+enter", handler: handleConvert },
    {
      combo: "mod+shift+c",
      handler: () => {
        if (targetBufRef.current) {
          void navigator.clipboard?.writeText(targetBufRef.current);
        }
      },
    },
  ]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const providerInfo = getProviderInfo(settings.provider);
  const showKeyBanner =
    capabilities !== null &&
    !settings.apiKeys[settings.provider] &&
    !capabilities.ai.envKeys[settings.provider];

  return (
    <div className="flex w-full flex-col lg:h-[calc(100vh-4rem)]">
      {capsLoading && (
        <div className="h-0.5 shrink-0 bg-accent/20 anim-pulse-soft" aria-hidden="true" />
      )}

      {/* Row 1 — language pair */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-1">
          <LanguageSelect
            value={sourceLanguage}
            onChange={handleSourceLanguageChange}
            label="Source language"
          />
          <IconButton label="Swap languages" onClick={handleSwap}>
            <ArrowLeftRight size={16} />
          </IconButton>
          <LanguageSelect
            value={targetLanguage}
            onChange={handleTargetLanguageChange}
            label="Target language"
          />
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            title={`${providerInfo.name} · ${activeModel(settings)} (change in Settings)`}
            className="hidden max-w-[280px] items-center gap-2 rounded-md border border-line px-2.5 py-1 font-mono text-[12.5px] text-ink-dim transition-colors duration-150 hover:border-line-strong hover:text-ink sm:flex"
          >
            <BrandIcon id={settings.provider} size={14} />
            <span className="truncate">{activeModel(settings)}</span>
          </Link>
          <div className="hidden items-center gap-1.5 md:flex" aria-hidden="true">
            <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
            <kbd>↵</kbd>
            <span className="text-[13px] text-ink-mute">Convert</span>
          </div>
        </div>
      </div>

      {/* No-API-key banner */}
      {showKeyBanner && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-elevated/50 px-5 py-2 text-[13.5px] text-ink-dim">
          <span>No {providerInfo.name} API key yet. Conversions need one.</span>
          <Link
            href="/settings"
            className="text-ink underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            Add it in Settings
          </Link>
        </div>
      )}

      {/* Row 2 — editors */}
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-line lg:min-h-[240px] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="h-[420px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0">
          <EditorPane
            label="Source"
            language={getLanguage(sourceLanguage)}
            value={sourceCode}
            onChange={handleSourceChange}
            // Locked mid-conversion so the verdict always matches this code.
            readOnly={state === "converting"}
            prefs={settings}
            onLoadSample={() =>
              handleSourceChange(getLanguage(sourceLanguage).sample)
            }
            onRun={() => void handleRun("source")}
            runDisabled={runBlocked("source")}
            running={runs.source?.running}
            runLabel={isPlayable(sourceLanguage, sourceCode) ? "Play" : "Run"}
          >
            {runs.source && (
              <RunOutput
                run={runs.source}
                currentCode={sourceCode}
                onClose={() => closeRun("source")}
              />
            )}
          </EditorPane>
        </div>
        <div className="h-[420px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0">
          <EditorPane
            label="Converted"
            language={getLanguage(targetLanguage)}
            value={targetCode}
            readOnly
            streaming={state === "converting"}
            prefs={settings}
            emptyHint="Converted code appears here"
            onRun={() => void handleRun("target")}
            runDisabled={runBlocked("target")}
            running={runs.target?.running}
            runLabel={isPlayable(targetLanguage, targetCode) ? "Play" : "Run"}
          >
            {runs.target && (
              <RunOutput
                run={runs.target}
                currentCode={targetCode}
                onClose={() => closeRun("target")}
              />
            )}
          </EditorPane>
        </div>
      </div>

      {playSide && (
        <PlayWindow
          code={sideOf(playSide).code}
          language={getLanguage(sideOf(playSide).language)}
          onClose={() => setPlaySide(null)}
        />
      )}

      {/* Row 3 — verification */}
      <VerificationPanel
        verification={verification}
        analysis={analysis}
        notes={notes}
        converting={state === "converting"}
        onFix={
          verification?.sourceRun && verification?.targetRun ? handleFix : undefined
        }
        sourceLang={getLanguage(sourceLanguage)}
        targetLang={getLanguage(targetLanguage)}
        defaultCollapsed={settings.reportCollapsed}
      />

      {/* Row 4 — status + primary action */}
      <ConvertBar
        state={state}
        stage={stage}
        fixAttempt={fixAttempt}
        errorMessage={errorMessage}
        capabilities={capabilities}
        capsLoading={capsLoading}
        capsError={capsError}
        onRetryCapabilities={retryCapabilities}
        canConvert={canConvert}
        onConvert={handleConvert}
        onStop={resetOutcome}
      />
    </div>
  );
}
