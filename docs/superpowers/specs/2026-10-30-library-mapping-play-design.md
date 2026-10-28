# Library mapping + graphical programs + Play window — design

Approved 2026-10-30.

## Problem
Converting a pygame program to JavaScript produced JS that fakes the Python
ImportError, because the prompt said "standard library only, byte-identical
stdout". Graphical programs can't be verified by stdout and can't run in the
headless runners at all.

## 1. Library mapping (prompts)
- Each `LanguageConfig` gains `runtimeLibraries` (what code may use when it runs
  here) — passed to the AI for source and target.
- System prompt: translate third-party libraries to the closest equivalent the
  target runtime has; implement missing pieces in plain code; never simulate a
  missing library or an import error.

## 2. Graphical detection (config, deterministic)
- `LanguageConfig.graphical?: RegExp` — matches imports of GUI/graphics libraries
  (pygame/tkinter/turtle, Swing/AWT/JavaFX, SDL/raylib/SFML, ebiten/fyne,
  macroquad/bevy, gosu/ruby2d, DOM/canvas for JS/TS).
- `isGraphical(languageId, code)` in `lib/languages.ts`, with a self-check.
- Graphical source → the convert prompt asks for a graphical target; for JS/TS the
  target is a canvas program for the Play window (globals `canvas`, `ctx`;
  keyboard/mouse on `window`; `requestAnimationFrame`; no Node APIs, no network).
- Pipeline: if source or target is graphical, skip execution and finish `partial`
  with an honest reason; `VerificationResult.graphical = true`.

## 3. Play window
- Graphical JS/TS: the editor's Run button becomes **Play** and opens a native
  `<dialog>` holding an `<iframe sandbox="allow-scripts">` (opaque origin: no app
  storage, no same-origin API access) whose `srcdoc` carries a CSP of
  `default-src 'none'` (no network). Console output is relayed by `postMessage`
  (parent checks `event.source`). Restart remounts the iframe. TS is transpiled
  by the existing TS worker first.
- Trade-off: an infinite loop in a non-process-isolated browser can freeze the tab.

## Out of scope
Python/Java/C++ game windows; network in sandboxes.
