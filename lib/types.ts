// Shared contracts for CodeShift. Every layer — AI providers, sandboxed
// execution, the pipeline, and the UI — builds against these types.

export const LANGUAGE_IDS = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "c",
  "go",
  "rust",
  "php",
  "ruby",
] as const;

export type LanguageId = (typeof LANGUAGE_IDS)[number];

export type LanguageConfig = {
  id: LanguageId;
  name: string;
  /** File extension without the dot, e.g. "py" */
  extension: string;
  /** File name used inside the sandbox, e.g. "main.py" / "Main.java" */
  fileName: string;
  monacoLanguage: string;
  /** Human-readable runtime label, e.g. "Python 3.12" */
  runtime: string;
  dockerImage: string;
  /** Run inside the container via `sh -c`; the code file is mounted read-only at /work */
  executeCommand: string;
  supportsBrowserExecution: boolean;
  /** What code can use when it runs here — told to the AI so it maps libraries onto it */
  runtimeLibraries: string;
  /** Matches source that uses a GUI/graphics library (draws a window, not stdout) */
  graphical?: RegExp;
  /** Runtime quirks passed to the AI so stdout can match across languages */
  aiNotes: string;
  /** Built-in sample program. Every language's sample prints identical output. */
  sample: string;
};

// ---------------------------------------------------------------------------
// AI layer
// ---------------------------------------------------------------------------

/**
 * Selectable AI providers. `models` are suggestions only (the first is the
 * default) — users can type any model id, and "Test connection" loads the
 * provider's live list. `envKey` is the .env.local fallback for the API key.
 */
export const AI_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    models: ["gemini-3.8-flash"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    models: ["openrouter/auto"],
  },
] as const;

export type AIProviderId = (typeof AI_PROVIDERS)[number]["id"];
export type AIProviderInfo = (typeof AI_PROVIDERS)[number];

export function isProviderId(value: unknown): value is AIProviderId {
  return AI_PROVIDERS.some((p) => p.id === value);
}

export function getProviderInfo(id: AIProviderId): AIProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

/** A plausible model id: letters, digits and . _ : / @ - only, max 120 chars. */
export function isModelName(value: unknown): value is string {
  return typeof value === "string" && /^[\w.:/@-]{1,120}$/.test(value);
}

/** HTTP header carrying a user-supplied API key (never sent in the body). */
export const AI_KEY_HEADER = "x-ai-key";

export type ConvertRequestBody = {
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  sourceCode: string;
  provider: AIProviderId;
  model: string;
};

export type FixRequestBody = ConvertRequestBody & {
  /** The previously generated target code that failed verification */
  targetCode: string;
  /** Normalized stdout of the source run */
  sourceOutput: string;
  /** Normalized stdout of the failing target run */
  targetOutput: string;
  /** stderr of the failing target run (may be empty) */
  targetStderr: string;
  /** 1-based fix attempt number */
  attempt: number;
};

/** NDJSON events streamed by /api/ai/convert and /api/ai/fix (one JSON object per line). */
export type AIStreamEvent =
  | { type: "analysis-delta"; text: string }
  | { type: "code-delta"; text: string }
  | { type: "done"; code: string; notes?: string }
  | { type: "error"; message: string; detail?: string };

// ---------------------------------------------------------------------------
// Execution layer
// ---------------------------------------------------------------------------

export type ExecutionEnvironment = "docker" | "browser";

export type ExecutionResult = {
  /** Ran to completion with exit code 0 and no infrastructure error */
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  /** Output exceeded the size cap and was cut off */
  truncated: boolean;
  durationMs: number;
  environment: ExecutionEnvironment;
  /** Sandbox/infrastructure failure (docker missing, worker crash) — not a program error */
  infraError?: string;
};

export type ExecuteRequestBody = {
  languageId: LanguageId;
  code: string;
};

export type DockerLanguageState = "ready" | "image-missing" | "unavailable";

export type Capabilities = {
  /** Which providers have an API key in the server environment (.env.local) */
  ai: { envKeys: Record<AIProviderId, boolean> };
  execution: {
    docker: boolean;
    dockerVersion?: string;
    languages: Record<LanguageId, { docker: DockerLanguageState; browser: boolean }>;
  };
};

// ---------------------------------------------------------------------------
// Verification + pipeline
// ---------------------------------------------------------------------------

export type VerificationStatus = "verified" | "partial" | "failed" | "unavailable";

export type FixAttemptRecord = {
  /** 1-based attempt number */
  attempt: number;
  /** The AI's diagnosis of the mismatch (its streamed <analysis> text) */
  diagnosis: string;
  /** Whether source and target outputs matched after this attempt */
  matched: boolean;
};

export type VerificationResult = {
  status: VerificationStatus;
  /** One-line human explanation of the status */
  reason: string;
  sourceRun?: ExecutionResult;
  targetRun?: ExecutionResult;
  match?: boolean;
  fixAttempts: number;
  /** Source printed identical output on two runs; undefined = not checked */
  stable?: boolean;
  /** Every AI fix attempt made for this conversion, oldest first */
  attempts?: FixAttemptRecord[];
  /** Who did the converting, e.g. "Claude Opus 5" */
  model?: string;
  /** A graphical program — not executed or compared; the converted code may be Playable */
  graphical?: boolean;
};

export type OutputComparison = {
  match: boolean;
  /** Normalized source output */
  source: string;
  /** Normalized target output */
  target: string;
  /** 0-based index of the first differing line, or null when outputs match */
  firstDiffLine: number | null;
};

export type PipelineStageId =
  | "analyze"
  | "generate"
  | "validate"
  | "execute"
  | "compare"
  | "fix";

export type ConversionOutcome = {
  targetCode: string;
  notes?: string;
  verification: VerificationResult;
};

/** Events yielded by the client-side pipeline orchestrator for the UI to render. */
export type PipelineEvent =
  | { type: "stage"; stage: PipelineStageId; detail?: string }
  | { type: "analysis-delta"; text: string }
  | { type: "code-delta"; text: string }
  /** A fix attempt is starting — clear the target editor before new deltas arrive */
  | { type: "code-reset" }
  | { type: "execution"; side: "source" | "target"; result: ExecutionResult }
  | { type: "done"; outcome: ConversionOutcome }
  | { type: "error"; message: string; detail?: string };

// ---------------------------------------------------------------------------
// History + settings (persisted in localStorage, client-only)
// ---------------------------------------------------------------------------

export type ConversionRecord = {
  id: string;
  createdAt: number;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  sourceCode: string;
  targetCode: string;
  verification: VerificationStatus;
  verificationReason: string;
  notes?: string;
};

export type AppSettings = {
  provider: AIProviderId;
  /** Chosen model per provider; a missing entry means that provider's default */
  models: Partial<Record<AIProviderId, string>>;
  /** API keys typed into Settings, per provider (stored in this browser only) */
  apiKeys: Partial<Record<AIProviderId, string>>;
  /** Maximum AI repair attempts after a failed verification */
  fixAttempts: 0 | 1 | 2;
  /** Code editor font size in px (12–20) */
  editorFontSize: number;
  /** Spaces per tab in the editors */
  tabSize: 2 | 4;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  /** Open the verification report collapsed to one line */
  reportCollapsed: boolean;
  /** Language pair the converter opens with */
  defaultSource: LanguageId;
  defaultTarget: LanguageId;
};

export const DEFAULT_SETTINGS: AppSettings = {
  provider: "anthropic",
  models: {},
  apiKeys: {},
  fixAttempts: 2,
  editorFontSize: 14,
  tabSize: 4,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
  reportCollapsed: false,
  defaultSource: "python",
  defaultTarget: "javascript",
};
