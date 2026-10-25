import type { OutputComparison } from "./types";

/**
 * Normalize program output so cosmetic differences don't count as mismatches:
 * unify line endings, strip trailing whitespace per line, drop trailing blank lines.
 */
export function normalizeOutput(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "");
}

/** Compare two program outputs after normalization. */
export function compareOutputs(sourceRaw: string, targetRaw: string): OutputComparison {
  const source = normalizeOutput(sourceRaw);
  const target = normalizeOutput(targetRaw);

  if (source === target) {
    return { match: true, source, target, firstDiffLine: null };
  }

  const sourceLines = source.split("\n");
  const targetLines = target.split("\n");
  const max = Math.max(sourceLines.length, targetLines.length);
  let firstDiffLine = 0;
  for (let i = 0; i < max; i++) {
    if (sourceLines[i] !== targetLines[i]) {
      firstDiffLine = i;
      break;
    }
  }

  return { match: false, source, target, firstDiffLine };
}
