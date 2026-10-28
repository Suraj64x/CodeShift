# Multi-provider AI + settings — design

Approved 2026-10-30.

## Goal
Pick the AI provider and model in Settings, paste an API key there, and tune a few
editor defaults — without editing `.env.local`.

## Providers
`anthropic` (existing SDK provider) plus `openai`, `gemini`, `openrouter` via one
OpenAI-compatible streaming connector (`lib/ai/openai-compat.ts`, plain `fetch` +
SSE, no new dependency). Base URLs are a fixed server-side table — the client only
sends a provider id, never a URL (no SSRF).

## Keys
- Saved per provider in localStorage (`AppSettings.apiKeys`).
- Sent per request in the `x-ai-key` header (never the body, never logged).
- Server: header key, else `<PROVIDER>_API_KEY` from env.
- Capabilities reports which providers have an env key so the convert page's
  "no key" banner considers both.

## Settings (`AppSettings`)
`provider`, `model` (free text, validated server-side by a safe charset/length),
`apiKeys`, `fixAttempts`, `editorFontSize` (12–20), `defaultSource`, `defaultTarget`.

## UI
Settings → AI: provider select, key field (show/hide, "get a key" link), model text
input with native `<datalist>` suggestions, Test connection (runs a one-line real
conversion, shows ✓ provider · model · time or the error).
Settings → Editor: font size, default language pair.

## Out of scope
Ollama/local models, per-session-only key storage, server-side key storage.
