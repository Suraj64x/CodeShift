<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PROJECT: CodeShift

AI-powered multi-language code converter with **behavior verification**. Web
only — no native apps, no Electron, no extensions. Positioning: *"AI converts
your code. The system checks whether the result actually behaves the same."*
Never write UI copy claiming equivalence unless both programs were actually
executed and their outputs compared.

## Architecture (all in this one Next.js app)

- `lib/types.ts` — the shared contract every layer builds against. Change deliberately.
- `lib/languages.ts` — the 10 `LanguageConfig`s. **Languages are added here, by
  configuration, not by writing new code paths.** Every language's `sample`
  prints byte-identical output.
- `lib/ai/` — provider abstraction (`AIProvider` interface). `anthropic.ts`
  (Claude via the SDK: streaming, adaptive thinking, no temperature — sampling
  params are rejected on Claude 5 models) and `openai-compat.ts` (OpenAI,
  Gemini, OpenRouter over fixed base URLs, plain fetch + SSE). Provider, model
  and API key are chosen in Settings; the key travels in the `x-ai-key` header
  with `.env.local` as fallback. `app/api/ai/models` lists a key's models.
  Routes `app/api/ai/convert` + `app/api/ai/fix` stream NDJSON `AIStreamEvent`s.
- `lib/execution/` — Docker sandbox runner (fresh container per run: `--network
  none`, 256 MB, 1 CPU, 15 s timeout, read-only FS, pids cap, output cap,
  max 2 concurrent). `app/api/execute`, `app/api/capabilities`.
- `public/workers/` + `lib/client/browser-exec.ts` — browser-tier execution
  (JS/TS in Web Workers with a minimal `process`/`require` shim, Python via Pyodide,
  which auto-loads its ~300 prebuilt packages — pygame-ce, numpy, pandas… — from a
  program's imports; a crashed interpreter gets a fresh worker). **User code never runs on the
  host server or the main thread.** Exception by design: graphical JS/TS (detected
  by `LanguageConfig.graphical`) plays in the Play window — an opaque-origin
  `sandbox="allow-scripts"` iframe with a `default-src 'none'` CSP (`lib/play.ts`).
  Each language's `runtimeLibraries` tells the AI what it may map libraries onto.
- `lib/client/pipeline.ts` — the client-side orchestrator: convert → execute
  both → compare (`lib/compare.ts`) → AI fix loop → verification status
  (`verified` / `partial` / `failed` / `unavailable`).
- History + settings live in localStorage (`lib/client/history.ts`,
  `lib/client/settings.ts`). No database, no auth — deliberate MVP choice.

## Design system (Grok × Linear × Raycast — dark, minimal, premium)

Single dark theme. Use ONLY the tokens in `app/globals.css` (`bg-base`,
`bg-panel`, `bg-elevated`, `border-line`, `text-ink`, `text-ink-dim`,
`text-ink-mute`, `bg-accent`, `text-success/danger/warn`). Hairline borders,
small radii, `.label` micro-labels, 150–250 ms transitions. **No gradients, no
glassmorphism, no neon, no stock imagery, no dashboard clutter.** One primary
(white) action per screen.

## Environment

- `.env.local` (optional fallback for keys typed in Settings): `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`.
- Dev on Windows. Docker Desktop is optional — the app detects it at runtime
  and degrades honestly (browser tier for Python/JS/TS, `△ partial` states for
  the rest). Never fake a green check.

