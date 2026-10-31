"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Code2,
  Database,
  Eye,
  EyeOff,
  Keyboard,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import LanguageSelect from "@/components/convert/LanguageSelect";
import { Button, Spinner, cx } from "@/components/ui";
import { LANGUAGES } from "@/lib/languages";
import {
  activeModel,
  aiHeaders,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  saveSettings,
  subscribeSettings,
} from "@/lib/client/settings";
import {
  clearHistory,
  getHistorySnapshot,
  getServerHistorySnapshot,
  subscribeHistory,
} from "@/lib/client/history";
import {
  AI_PROVIDERS,
  DEFAULT_SETTINGS,
  getProviderInfo,
  isModelName,
  type AIProviderId,
  type AppSettings,
  type Capabilities,
  type LanguageId,
} from "@/lib/types";

type Update = (patch: Partial<AppSettings>) => void;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const SECTIONS: Array<{ id: string; icon: LucideIcon; title: string }> = [
  { id: "ai", icon: Sparkles, title: "AI" },
  { id: "editor", icon: Code2, title: "Editor" },
  { id: "converter", icon: ArrowLeftRight, title: "Converter" },
  { id: "verification", icon: ShieldCheck, title: "Verification" },
  { id: "environment", icon: Server, title: "Environment" },
  { id: "data", icon: Database, title: "Data" },
  { id: "shortcuts", icon: Keyboard, title: "Shortcuts" },
];

function Section({
  id,
  description,
  children,
}: {
  id: string;
  description: string;
  children: ReactNode;
}) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="flex items-center gap-3">
        <meta.icon size={22} strokeWidth={2.5} className="text-ink" aria-hidden="true" />
        <h2 id={`${id}-title`} className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {meta.title}
        </h2>
      </div>
      <p className="mt-1.5 text-[15px] text-ink-dim">{description}</p>
      <div className="mt-5 divide-y divide-line rounded-xl border border-line bg-panel">
        {children}
      </div>
    </section>
  );
}

/** One setting: text on the left, control on the right (stacked when `wide`). */
function Row({
  title,
  description,
  wide = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "gap-x-8 gap-y-3 px-5 py-4",
        wide ? "flex flex-col" : "flex flex-col sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <div className="min-w-0">
        <div className="text-[16px] font-medium text-ink">{title}</div>
        {description && <div className="mt-0.5 text-[14px] text-ink-mute">{description}</div>}
      </div>
      {children && <div className={cx("flex items-center", !wide && "shrink-0")}>{children}</div>}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-7 w-12 rounded-full border transition-colors duration-200",
        checked ? "border-transparent bg-success/85" : "border-line-strong bg-elevated",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform duration-200",
          checked ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/** A row of mutually exclusive buttons. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-line bg-elevated p-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            "h-8 rounded-md px-3.5 text-[14px] font-medium transition-colors duration-150",
            option.value === value ? "bg-accent text-[#0a0a0a]" : "text-ink-dim hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A destructive button that asks for a second click within 3 seconds. */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled && !armed}
      onClick={() => {
        if (timer.current !== null) clearTimeout(timer.current);
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      <span className={armed ? "text-danger" : undefined}>{armed ? confirmLabel : label}</span>
    </Button>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-line bg-elevated px-3.5 font-mono text-[14px] text-ink placeholder:text-ink-mute transition-colors duration-150 hover:border-line-strong focus:border-line-strong focus:outline-none";

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

type TestResult = { state: "pass" | "warn" | "fail"; text: string };

const TEST_ICON = {
  pass: { icon: Check, tone: "text-success" },
  warn: { icon: TriangleAlert, tone: "text-warn" },
  fail: { icon: X, tone: "text-danger" },
} as const;

function keyStatus(
  settings: AppSettings,
  caps: Capabilities | null,
  id: AIProviderId,
): { text: string; tone: string } {
  if (settings.apiKeys[id]) return { text: "Key saved", tone: "border-success/30 text-success" };
  if (caps?.ai.envKeys[id]) return { text: "From .env.local", tone: "border-success/30 text-success" };
  return { text: "No key", tone: "border-line text-ink-mute" };
}

/** Provider cards, API key, model, and a free "Test connection" (lists the key's models). */
function AISettings({
  settings,
  update,
  caps,
}: {
  settings: AppSettings;
  update: Update;
  caps: Capabilities | null;
}) {
  const provider = getProviderInfo(settings.provider);
  const key = settings.apiKeys[provider.id] ?? "";
  const model = settings.models[provider.id] ?? "";
  const envKey = caps?.ai.envKeys[provider.id] ?? false;
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  // Live model list from the last successful test, tagged with its provider.
  const [liveModels, setLiveModels] = useState<{ id: AIProviderId; models: string[] } | null>(
    null,
  );
  const suggestions = liveModels?.id === provider.id ? liveModels.models : [...provider.models];

  async function testConnection() {
    setTesting(true);
    setTest(null);
    const started = performance.now();
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiHeaders(settings) },
        body: JSON.stringify({ provider: provider.id }),
      });
      const data = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok || !data.models) {
        setTest({
          state: "fail",
          text: data.error ?? `The server responded with HTTP ${res.status}.`,
        });
        return;
      }
      setLiveModels({ id: provider.id, models: data.models });
      const chosen = activeModel(settings);
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      setTest(
        data.models.includes(chosen)
          ? { state: "pass", text: `Connected · ${chosen} is available · ${secs}s` }
          : {
              state: "warn",
              text: `Key works, but “${chosen}” isn't among your ${data.models.length} models. Pick one from the Model suggestions.`,
            },
      );
    } catch {
      setTest({ state: "fail", text: "Couldn't reach the server." });
    } finally {
      setTesting(false);
    }
  }

  const TestIcon = test ? TEST_ICON[test.state].icon : null;

  return (
    <Section id="ai" description="Which AI converts your code, and the key it uses.">
      <div className="px-5 py-5">
        <div className="text-[16px] font-medium text-ink">Provider</div>
        <div
          role="radiogroup"
          aria-label="AI provider"
          className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {AI_PROVIDERS.map((p) => {
            const selected = p.id === provider.id;
            const status = keyStatus(settings, caps, p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  update({ provider: p.id });
                  setTest(null);
                }}
                className={cx(
                  "flex min-w-0 flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors duration-150",
                  selected ? "border-ink/70 bg-elevated" : "border-line hover:border-line-strong",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <BrandIcon id={p.id} size={28} />
                  {selected && <Check size={18} strokeWidth={3} className="text-ink" aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold text-ink">{p.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[12.5px] text-ink-mute">
                    {settings.models[p.id] || p.models[0]}
                  </div>
                </div>
                <span className={cx("rounded-md border px-2 py-0.5 text-[12px]", status.tone)}>
                  {status.text}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Row
        wide
        title={`${provider.name} API key`}
        description={
          <>
            {!key && envKey
              ? `Using ${provider.envKey} from .env.local. A key pasted here takes priority.`
              : "Saved in this browser only. Sent to this app's server per request, never logged."}{" "}
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-dim underline underline-offset-2 transition-colors hover:text-ink"
            >
              Get a key ↗
            </a>
          </>
        }
      >
        <div className="relative w-full max-w-2xl">
          <input
            type={showKey ? "text" : "password"}
            aria-label={`${provider.name} API key`}
            autoComplete="off"
            spellCheck={false}
            value={key}
            placeholder={envKey ? "Using .env.local" : "Paste your key"}
            onChange={(event) => {
              update({ apiKeys: { ...settings.apiKeys, [provider.id]: event.target.value.trim() } });
              setTest(null);
            }}
            className={cx(inputClass, "pr-11")}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-mute transition-colors hover:text-ink"
          >
            {showKey ? (
              <EyeOff size={17} strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <Eye size={17} strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>
        </div>
      </Row>

      <Row
        wide
        title="Model"
        description={
          model && !isModelName(model)
            ? "That doesn't look like a model id (letters, digits, . _ : / @ - only)."
            : "Pick a suggestion or type any model your provider offers. Empty uses the default."
        }
      >
        <input
          list="model-suggestions"
          aria-label="AI model"
          autoComplete="off"
          spellCheck={false}
          value={model}
          placeholder={provider.models[0]}
          onChange={(event) => {
            update({ models: { ...settings.models, [provider.id]: event.target.value.trim() } });
            setTest(null);
          }}
          className={cx(inputClass, "max-w-2xl")}
        />
        <datalist id="model-suggestions">
          {suggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Row>

      <Row
        title="Connection"
        description={
          test && TestIcon ? (
            <span role="status" className="flex items-start gap-1.5">
              <TestIcon
                size={15}
                strokeWidth={3}
                className={cx("mt-0.5 shrink-0", TEST_ICON[test.state].tone)}
                aria-hidden="true"
              />
              <span className="text-ink-dim">{test.text}</span>
            </span>
          ) : (
            "Checks your key and loads your provider's model list. Free, no AI tokens used."
          )
        }
      >
        <Button variant="ghost" onClick={testConnection} disabled={testing}>
          {testing && <Spinner />}
          Test connection
        </Button>
      </Row>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsClient() {
  // Settings and history come from hydration-safe subscription stores: the
  // server snapshot is the default, the client snapshot reads localStorage.
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getServerHistorySnapshot,
  );

  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);

  // "Saved" flash: 0 hidden, 1 visible, 2 fading out.
  const [savedPhase, setSavedPhase] = useState<0 | 1 | 2>(0);
  const savedTimers = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Capabilities>;
      })
      .then((data) => {
        if (!cancelled) setCaps(data);
      })
      .catch(() => {
        if (!cancelled) {
          setCapsError("Couldn't reach the server to check the environment.");
        }
      });

    return () => {
      cancelled = true;
      savedTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const flashSaved = useCallback(() => {
    savedTimers.current.forEach((t) => clearTimeout(t));
    savedTimers.current = [
      window.setTimeout(() => setSavedPhase(2), 1000),
      window.setTimeout(() => setSavedPhase(0), 1500),
    ];
    setSavedPhase(1);
  }, []);

  const update = useCallback<Update>(
    (patch) => {
      // The settings store notifies every subscriber (this page, the converter).
      saveSettings({ ...getSettingsSnapshot(), ...patch });
      flashSaved();
    },
    [flashSaved],
  );

  // Picking the language already on the other side swaps the pair.
  const setDefaultPair = (id: LanguageId, side: "source" | "target") => {
    const { defaultSource: src, defaultTarget: tgt } = settings;
    if (side === "source") update({ defaultSource: id, defaultTarget: id === tgt ? src : tgt });
    else update({ defaultTarget: id, defaultSource: id === src ? tgt : src });
  };

  function exportHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `codeshift-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Docker images that still need pulling (deduplicated — some languages share one).
  const missingImages =
    caps === null
      ? []
      : Array.from(
          new Set(
            LANGUAGES.filter(
              (lang) => caps.execution.languages[lang.id].docker === "image-missing",
            ).map((lang) => lang.dockerImage),
          ),
        );

  const savedKeys = Object.values(settings.apiKeys).filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-14">
      <div className="flex items-baseline gap-4">
        <h1 className="text-[clamp(34px,4vw,44px)] font-semibold tracking-[-0.035em] text-ink">
          Settings
        </h1>
        <span
          role="status"
          aria-live="polite"
          className={cx(
            "flex items-center gap-1.5 text-[14px] text-success transition-opacity duration-500",
            savedPhase === 1 ? "opacity-100" : "opacity-0",
          )}
        >
          {savedPhase !== 0 && (
            <>
              <Check size={15} strokeWidth={3} aria-hidden="true" /> Saved
            </>
          )}
        </span>
      </div>
      <p className="mt-2 text-[16px] text-ink-dim">
        Everything is saved automatically, in this browser only.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Sticky section menu */}
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink-dim transition-colors duration-150 hover:bg-elevated hover:text-ink"
                >
                  <s.icon size={18} strokeWidth={2.5} aria-hidden="true" />
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-14">
          <AISettings settings={settings} update={update} caps={caps} />

          <Section id="editor" description="How code looks in both editors. Changes apply live.">
            <Row title="Font size" description="Size of the code text.">
              <Segmented
                label="Editor font size"
                value={settings.editorFontSize}
                options={[12, 14, 16, 18, 20].map((px) => ({ value: px, label: `${px}` }))}
                onChange={(editorFontSize) => update({ editorFontSize })}
              />
            </Row>
            <Row title="Tab size" description="Spaces per indentation level.">
              <Segmented
                label="Tab size"
                value={settings.tabSize}
                options={[
                  { value: 2 as const, label: "2" },
                  { value: 4 as const, label: "4" },
                ]}
                onChange={(tabSize) => update({ tabSize })}
              />
            </Row>
            <Row title="Word wrap" description="Wrap long lines instead of scrolling sideways.">
              <Switch label="Word wrap" checked={settings.wordWrap} onChange={(wordWrap) => update({ wordWrap })} />
            </Row>
            <Row title="Minimap" description="A zoomed-out overview of the code at the right edge.">
              <Switch label="Minimap" checked={settings.minimap} onChange={(minimap) => update({ minimap })} />
            </Row>
            <Row title="Line numbers">
              <Switch
                label="Line numbers"
                checked={settings.lineNumbers}
                onChange={(lineNumbers) => update({ lineNumbers })}
              />
            </Row>
          </Section>

          <Section id="converter" description="What the converter starts with.">
            <Row title="Default languages" description="The pair the converter opens with.">
              <div className="flex items-center gap-1 rounded-lg border border-line bg-elevated px-1">
                <LanguageSelect
                  value={settings.defaultSource}
                  onChange={(id) => setDefaultPair(id, "source")}
                  label="Default source language"
                />
                <ArrowRight size={16} strokeWidth={2.5} className="text-ink-mute" aria-hidden="true" />
                <LanguageSelect
                  value={settings.defaultTarget}
                  onChange={(id) => setDefaultPair(id, "target")}
                  label="Default target language"
                />
              </div>
            </Row>
            <Row
              title="Open report collapsed"
              description="Show the verification report as one slim line until you expand it."
            >
              <Switch
                label="Open report collapsed"
                checked={settings.reportCollapsed}
                onChange={(reportCollapsed) => update({ reportCollapsed })}
              />
            </Row>
          </Section>

          <Section id="verification" description="How hard CodeShift works to make outputs match.">
            <Row
              title="Auto-fix attempts"
              description="How many times the AI may repair a conversion whose output doesn't match."
            >
              <Segmented
                label="Auto-fix attempts"
                value={settings.fixAttempts}
                options={[
                  { value: 0 as const, label: "Off" },
                  { value: 1 as const, label: "1" },
                  { value: 2 as const, label: "2" },
                ]}
                onChange={(fixAttempts) => update({ fixAttempts })}
              />
            </Row>
          </Section>

          <Section id="environment" description="Where each language can run on this machine.">
            {caps === null && capsError === null && (
              <div role="status" className="flex items-center gap-2 px-5 py-4 text-[14px] text-ink-mute">
                <Spinner /> Checking execution environments…
              </div>
            )}
            {capsError !== null && <div className="px-5 py-4 text-[14px] text-warn">{capsError}</div>}
            {caps !== null && (
              <>
                <Row
                  title="Docker"
                  description={
                    caps.execution.docker
                      ? "Running. Every language can be executed and verified."
                      : "Not detected. Java, C, C++, Go, Rust, PHP and Ruby convert but can't be run."
                  }
                >
                  <span
                    className={cx(
                      "rounded-md border px-2.5 py-1 font-mono text-[13px]",
                      caps.execution.docker ? "border-success/30 text-success" : "border-warn/30 text-warn",
                    )}
                  >
                    {caps.execution.docker
                      ? caps.execution.dockerVersion
                        ? `v${caps.execution.dockerVersion}`
                        : "Detected"
                      : "Off"}
                  </span>
                </Row>
                <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5">
                  {LANGUAGES.map((lang) => {
                    const state = caps.execution.languages[lang.id];
                    const where = state.docker === "ready"
                      ? { text: "Docker", tone: "text-success" }
                      : state.browser
                        ? { text: "Browser", tone: "text-success" }
                        : state.docker === "image-missing"
                          ? { text: "Pull image", tone: "text-warn" }
                          : { text: "Needs Docker", tone: "text-ink-mute" };
                    return (
                      <div key={lang.id} className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-3">
                        <BrandIcon id={lang.id} size={22} />
                        <div className="min-w-0">
                          <div className="truncate text-[14.5px] font-medium text-ink">{lang.name}</div>
                          <div className={cx("text-[12.5px]", where.tone)}>{where.text}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {missingImages.length > 0 && (
                  <div className="px-5 py-4">
                    <div className="text-[14px] text-ink-dim">Pull the missing images once:</div>
                    <code className="mt-2 block select-all whitespace-pre-wrap rounded-lg bg-elevated px-3.5 py-2.5 font-mono text-[13px] text-ink-dim">
                      {missingImages.map((img) => `docker pull ${img}`).join("\n")}
                    </code>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section id="data" description="Everything below lives only in this browser.">
            <Row
              title="Export history"
              description={`Download your ${history.length} conversion${history.length === 1 ? "" : "s"} as a JSON file.`}
            >
              <Button variant="ghost" size="sm" onClick={exportHistory} disabled={history.length === 0}>
                Export
              </Button>
            </Row>
            <Row title="Clear history" description="Delete every saved conversion from this browser.">
              <ConfirmButton
                label="Clear history"
                confirmLabel="Click again to clear"
                onConfirm={clearHistory}
                disabled={history.length === 0}
              />
            </Row>
            <Row
              title="Forget API keys"
              description={`Remove the ${savedKeys} key${savedKeys === 1 ? "" : "s"} saved in Settings. Keys in .env.local aren't affected.`}
            >
              <ConfirmButton
                label="Forget keys"
                confirmLabel="Click again to forget"
                onConfirm={() => update({ apiKeys: {} })}
                disabled={savedKeys === 0}
              />
            </Row>
            <Row title="Reset settings" description="Back to defaults. Your API keys are kept.">
              <ConfirmButton
                label="Reset"
                confirmLabel="Click again to reset"
                onConfirm={() => update({ ...DEFAULT_SETTINGS, apiKeys: settings.apiKeys })}
              />
            </Row>
          </Section>

          <Section id="shortcuts" description="Keyboard shortcuts on the converter.">
            {[
              [["Ctrl / ⌘", "Enter"], "Convert"],
              [["Ctrl / ⌘", "Shift", "C"], "Copy the converted code"],
              [["Esc"], "Close the Play window"],
            ].map(([keys, action]) => (
              <Row key={action as string} title={action as string}>
                <span className="flex items-center gap-1.5">
                  {(keys as string[]).map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </Row>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
