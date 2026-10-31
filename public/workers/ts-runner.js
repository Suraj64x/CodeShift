/*
 * CodeShift browser sandbox — TypeScript runner (classic worker).
 *
 * Transpile-only (same contract as Node's --experimental-strip-types): the
 * TypeScript compiler rewrites the file to plain JavaScript, syntax errors are
 * reported, but not every type error will be caught. Then the JS runs in the
 * shared sandboxed core.
 *
 * Protocol:
 *   host → worker:  { id, code, transpileOnly? }
 *   worker → host:  { id, type: "result", stdout, stderr, exitCode, truncated }
 */
importScripts(
  "/workers/js-exec-core.js",
  "https://cdn.jsdelivr.net/npm/typescript@5.6.3/lib/typescript.min.js"
);

function formatDiagnostic(diagnostic) {
  var message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file && typeof diagnostic.start === "number") {
    var position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return "main.ts(" + (position.line + 1) + "," + (position.character + 1) + "): " + message;
  }
  return "main.ts: " + message;
}

self.onmessage = function (event) {
  var message = event.data || {};
  var id = message.id;

  function reply(result) {
    self.postMessage({
      id: id,
      type: "result",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
    });
  }

  var transpiled;
  try {
    transpiled = ts.transpileModule(String(message.code == null ? "" : message.code), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
      reportDiagnostics: true,
    });
  } catch (error) {
    reply({
      stdout: "",
      stderr: "TypeScript transpilation failed: " + String(error),
      exitCode: 1,
      truncated: false,
    });
    return;
  }

  var errors = (transpiled.diagnostics || []).filter(function (diagnostic) {
    return diagnostic.category === ts.DiagnosticCategory.Error;
  });
  if (errors.length > 0) {
    reply({
      stdout: "",
      stderr: errors.map(formatDiagnostic).join("\n") + "\n",
      exitCode: 1,
      truncated: false,
    });
    return;
  }

  // { transpileOnly: true } — return the JavaScript instead of running it
  // (the Play window runs it in its own sandboxed page).
  if (message.transpileOnly) {
    reply({ stdout: transpiled.outputText, stderr: "", exitCode: 0, truncated: false });
    return;
  }

  self.__csExec.run(transpiled.outputText).then(reply);
};
