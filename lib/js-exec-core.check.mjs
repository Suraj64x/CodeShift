// Self-check for the browser-tier JS runner (public/workers/js-exec-core.js).
// Loads it in an isolated context with no Node globals — like a Web Worker —
// and runs Node-style programs. Run: `node lib/js-exec-core.check.mjs`
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext("self = globalThis; console = {};", ctx);
vm.runInContext(
  fs.readFileSync(new URL("../public/workers/js-exec-core.js", import.meta.url), "utf8"),
  ctx,
);
const run = (code) => ctx.__csExec.run(code);

(async () => {
  let r = await run('console.log("hi")');
  assert.deepEqual([r.stdout, r.exitCode], ["hi\n", 0]);

  // process.stdout/stderr.write go to the captured streams.
  r = await run('process.stdout.write("a"); process.stdout.write("b\\n"); process.stderr.write("e")');
  assert.deepEqual([r.stdout, r.stderr, r.exitCode], ["ab\n", "e", 0]);

  // process.exit(code) stops the program with that exit code.
  r = await run('console.error("boom"); process.exit(3); console.log("unreachable")');
  assert.deepEqual([r.stdout, r.stderr, r.exitCode], ["", "boom\n", 3]);

  // process.exit() inside a function, and process.exitCode on normal completion.
  r = await run("function main() { console.log(1); process.exit(); } main(); console.log(2)");
  assert.deepEqual([r.stdout, r.exitCode], ["1\n", 0]);
  r = await run('console.log("x"); process.exitCode = 2');
  assert.deepEqual([r.stdout, r.exitCode], ["x\n", 2]);

  // require() fails with a clear message, not a ReferenceError.
  r = await run('require("fs")');
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /require\('fs'\) isn't available/);

  // Each run starts clean: a previous exitCode doesn't leak into the next run.
  r = await run('console.log("again")');
  assert.deepEqual([r.stdout, r.exitCode], ["again\n", 0]);

  console.log("js-exec-core: all checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
