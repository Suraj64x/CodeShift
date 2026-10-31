import { getLanguage, isGraphical } from "@/lib/languages";
import type { ConvertRequestBody, FixRequestBody, LanguageConfig } from "@/lib/types";

/**
 * Prompt builders shared by every AI provider. The system prompt pins the one
 * thing that matters — behavior preservation — and the exact reply format the
 * streaming tag parser (lib/ai/parse.ts) expects.
 */

export const SYSTEM_PROMPT = `You are an expert code translator. Your ONE goal is behavior preservation: when run with no input, the target program must produce byte-identical stdout and exit with the same status as the source program. For graphical programs (games, drawings, windows) behavior means what the user sees and does: the same visuals, controls, rules and timing.

Rules:
1. Write a single self-contained file — the entire program in one file.
2. Use only what the target runtime provides (its "Available" line). When the source uses a third-party library, translate what the program DOES with the closest equivalent the target has, implementing missing pieces in plain code. Never simulate a missing library — do not print an ImportError or exit early because a library is absent.
3. Keep the algorithmic structure of the source recognizable — translate it, don't redesign it.
4. Output must be deterministic: mirror the source's use of randomness, time, and input exactly. Never introduce new nondeterminism of your own.
5. Follow the target language's entry-point convention given in the target language block (for example, Java requires a public class named Main).
6. Do NOT use markdown code fences anywhere in your response.

Respond in exactly this format:
<analysis>2 to 5 sentences: what the program does, its exact output shape, and any edge cases that could break equivalence.</analysis>
<code>the complete target file, raw — no fences, no commentary</code>
<notes>optional: one or two sentences of caveats worth showing the user. Omit this tag entirely if there are none.</notes>`;

/** Program outputs embedded in fix prompts are capped at this many characters. */
const OUTPUT_TRUNCATE_LIMIT = 4000;

function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_TRUNCATE_LIMIT) return text;
  return text.slice(0, OUTPUT_TRUNCATE_LIMIT) + "\n…truncated";
}

function sourceLanguageBlock(config: LanguageConfig): string {
  return [
    `SOURCE LANGUAGE: ${config.name}`,
    `Runtime: ${config.runtime}`,
    `Notes: ${config.aiNotes}`,
  ].join("\n");
}

function targetLanguageBlock(config: LanguageConfig): string {
  return [
    `TARGET LANGUAGE: ${config.name}`,
    `Runtime: ${config.runtime}`,
    `Target file name: ${config.fileName}`,
    `Available: ${config.runtimeLibraries}`,
    `Notes: ${config.aiNotes}`,
  ].join("\n");
}

/** Extra instructions when the source is a graphical program (game, drawing, GUI). */
function graphicalBlock(target: LanguageConfig): string {
  if (target.id === "javascript" || target.id === "typescript") {
    return [
      "GRAPHICAL PROGRAM: the source draws a window, so write a browser canvas program for the Play window (this overrides the Node notes above):",
      "- Globals `canvas` (an HTMLCanvasElement, 480x640 by default; set canvas.width/height to the source's window size) and `ctx` (its 2D context) already exist. Don't create or look up another canvas.",
      "- Read keyboard and mouse with window.addEventListener and drive the main loop with requestAnimationFrame, keeping the source's frame rate and speeds.",
      "- Draw with ctx (shapes, colors, text) in place of images, sounds or fonts loaded from files. No network, no modules, no Node APIs.",
      "- Map the library's concepts directly (for pygame: display.set_mode → canvas size, the event loop → key listeners, Rect.colliderect → rectangle overlap, clock.tick(fps) → frame timing).",
      "- console.log output is shown under the canvas; use it only where the source prints.",
    ].join("\n");
  }
  return `GRAPHICAL PROGRAM: the source draws a window. Use ${target.name}'s most standard GUI or graphics approach that fits its "Available" line; if none fits, keep the program's logic and render its frames as text to stdout.`;
}

/** User message for a fresh conversion. */
export function buildConvertPrompt(req: ConvertRequestBody): string {
  const source = getLanguage(req.sourceLanguage);
  const target = getLanguage(req.targetLanguage);
  return [
    sourceLanguageBlock(source),
    "",
    targetLanguageBlock(target),
    "",
    ...(isGraphical(source.id, req.sourceCode) ? [graphicalBlock(target), ""] : []),
    "SOURCE CODE:",
    req.sourceCode,
  ].join("\n");
}

/** User message for repairing a conversion whose verified output didn't match. */
export function buildFixPrompt(req: FixRequestBody): string {
  const source = getLanguage(req.sourceLanguage);
  const target = getLanguage(req.targetLanguage);
  return [
    sourceLanguageBlock(source),
    "",
    targetLanguageBlock(target),
    "",
    "SOURCE CODE:",
    req.sourceCode,
    "",
    "FAILING TARGET CODE:",
    req.targetCode,
    "",
    "NORMALIZED SOURCE STDOUT (expected):",
    truncateOutput(req.sourceOutput),
    "",
    "NORMALIZED TARGET STDOUT (actual):",
    truncateOutput(req.targetOutput),
    "",
    "TARGET STDERR:",
    truncateOutput(req.targetStderr),
    "",
    `This is fix attempt ${req.attempt}. The target program's output does not match the source program's output. In your <analysis>, diagnose exactly why they differ, then return the complete corrected target file in the same <analysis>/<code>/<notes> format.`,
  ].join("\n");
}
