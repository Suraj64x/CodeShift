import type { AIStreamEvent } from "@/lib/types";

/**
 * Incremental parser for the model's <analysis>/<code>/<notes> reply format.
 *
 * Feed it raw text chunks as they stream in; it emits `analysis-delta` events
 * for text inside <analysis>…</analysis>, `code-delta` events for text inside
 * <code>…</code>, and silently collects <notes>…</notes>. Tags can be split
 * across chunk boundaries, so the last few characters of un-emitted text are
 * always held back until the next chunk (or `finish()`) resolves them.
 */

type ParserState = "outside" | "analysis" | "code" | "notes";
type TagState = Exclude<ParserState, "outside">;

const OPENING_TAGS: ReadonlyArray<{ token: string; state: TagState }> = [
  { token: "<analysis>", state: "analysis" },
  { token: "<code>", state: "code" },
  { token: "<notes>", state: "notes" },
];

const CLOSING_TAGS: Record<TagState, string> = {
  analysis: "</analysis>",
  code: "</code>",
  notes: "</notes>",
};

// The longest tag is "</analysis>" (11 characters). Holding back the last 12
// un-emitted characters guarantees a tag split across chunks is never emitted
// as if it were content.
const HOLDBACK = 12;

export class TagStreamParser {
  private state: ParserState = "outside";
  /** Un-emitted text still being scanned for tags. */
  private buffer = "";
  /** Every character ever fed, kept for the no-<code>-tag fallback. */
  private all = "";
  private analysis = "";
  private code = "";
  private notes = "";
  private sawCodeTag = false;

  /** Feed one streamed chunk; returns any delta events it produced. */
  feed(chunk: string): AIStreamEvent[] {
    this.all += chunk;
    this.buffer += chunk;
    const events: AIStreamEvent[] = [];
    let advanced = true;
    while (advanced) {
      advanced =
        this.state === "outside"
          ? this.consumeOpeningTag()
          : this.consumeClosingTag(events);
    }
    return events;
  }

  /**
   * Call after the stream ends. Returns the final collected code and notes.
   * Code handling: trim one leading/trailing newline and strip stray fence
   * lines; if the model never opened a <code> tag, fall back to the full
   * accumulated text with all markdown fence lines removed.
   */
  finish(): { code: string; notes?: string } {
    if (this.state !== "outside" && this.buffer !== "") {
      // Stream ended mid-section (truncated or malformed) — keep the tail.
      if (this.state === "analysis") this.analysis += this.buffer;
      else if (this.state === "code") this.code += this.buffer;
      else this.notes += this.buffer;
    }
    this.buffer = "";

    let code: string;
    if (this.sawCodeTag) {
      code = stripEdgeFenceLines(trimOneNewlineEachSide(this.code));
    } else {
      // The model ignored the format — use everything it wrote, minus fences.
      code = this.all
        .split("\n")
        .filter((line) => !line.trim().startsWith("```"))
        .join("\n")
        .trim();
    }

    const notes = this.notes.trim();
    return notes === "" ? { code } : { code, notes };
  }

  /** In "outside" state: look for the earliest opening tag. True if one was consumed. */
  private consumeOpeningTag(): boolean {
    let earliest: { token: string; state: TagState; index: number } | null = null;
    for (const tag of OPENING_TAGS) {
      const index = this.buffer.indexOf(tag.token);
      if (index !== -1 && (earliest === null || index < earliest.index)) {
        earliest = { token: tag.token, state: tag.state, index };
      }
    }
    if (earliest === null) {
      // Text between tags is never emitted; keep just enough to complete a
      // tag that may be split across this chunk boundary.
      if (this.buffer.length > HOLDBACK) this.buffer = this.buffer.slice(-HOLDBACK);
      return false;
    }
    this.buffer = this.buffer.slice(earliest.index + earliest.token.length);
    this.state = earliest.state;
    if (earliest.state === "code") this.sawCodeTag = true;
    return true;
  }

  /** Inside a tag: emit content up to the closing tag (or all but the holdback). */
  private consumeClosingTag(events: AIStreamEvent[]): boolean {
    const closing = CLOSING_TAGS[this.state as TagState];
    const index = this.buffer.indexOf(closing);
    if (index === -1) {
      if (this.buffer.length > HOLDBACK) {
        this.collect(this.buffer.slice(0, this.buffer.length - HOLDBACK), events);
        this.buffer = this.buffer.slice(-HOLDBACK);
      }
      return false;
    }
    this.collect(this.buffer.slice(0, index), events);
    this.buffer = this.buffer.slice(index + closing.length);
    this.state = "outside";
    return true;
  }

  private collect(text: string, events: AIStreamEvent[]): void {
    if (text === "") return;
    if (this.state === "analysis") {
      this.analysis += text;
      events.push({ type: "analysis-delta", text });
    } else if (this.state === "code") {
      this.code += text;
      events.push({ type: "code-delta", text });
    } else if (this.state === "notes") {
      this.notes += text;
    }
  }
}

/** Trim exactly one leading and one trailing newline (the ones hugging the tags). */
function trimOneNewlineEachSide(text: string): string {
  let out = text;
  if (out.startsWith("\r\n")) out = out.slice(2);
  else if (out.startsWith("\n")) out = out.slice(1);
  if (out.endsWith("\r\n")) out = out.slice(0, -2);
  else if (out.endsWith("\n")) out = out.slice(0, -1);
  return out;
}

/** Remove a markdown fence if it appears as the first and/or last line. */
function stripEdgeFenceLines(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;
  if (start < end && /^```[\w+#.-]*$/.test(lines[start].trim())) start += 1;
  if (end - 1 >= start && lines[end - 1].trim() === "```") end -= 1;
  if (start === 0 && end === lines.length) return text;
  return lines.slice(start, end).join("\n");
}
