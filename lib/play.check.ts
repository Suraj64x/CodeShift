// Self-check for the Play window document — run with `node lib/play.check.ts`.
import assert from "node:assert/strict";
import { buildPlayDocument } from "./play.ts";

const doc = buildPlayDocument('const s = "</script><script>alert(1)</script>";\nfoo(); <!-- x');

// User code can't close its <script> early: exactly 2 closing tags (boot + user).
assert.equal(doc.match(/<\/script>/gi)?.length, 2);
assert.ok(doc.includes('"<\\/script><script>alert(1)<\\/script>"'));
assert.ok(!doc.includes("foo(); <!--"));

// No network: CSP present with default-src 'none'.
assert.match(doc, /Content-Security-Policy" content="default-src 'none';/);

// The reported error line offset points at the user's first line.
const offset = Number(/event\.lineno - (\d+)/.exec(doc)?.[1]);
const docLines = doc.split("\n");
assert.equal(docLines[offset], 'const s = "<\\/script><script>alert(1)<\\/script>";');

console.log("play: all checks passed");
