/*
 * CodeShift browser sandbox — shared execution core (classic worker script).
 * Loaded via importScripts() by js-runner.js and ts-runner.js.
 * Exposes self.__csExec = { run, formatValue }.
 *
 * Security model: user code runs inside this Web Worker (no DOM access) and
 * every network primitive is replaced with a throwing stub before the user's
 * code executes. Output is captured from console.* and capped at 64 KB per
 * stream, matching the Docker sandbox limits.
 */
(function () {
  "use strict";

  var MAX_OUTPUT = 64 * 1024; // per-stream cap (bytes-ish; chars), same as Docker sandbox
  var MAX_DEPTH = 4;

  // --- Node-ish value formatter --------------------------------------------

  function isIdentifier(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
  }

  function quote(text) {
    return "'" + String(text).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }

  function formatArray(value, depth, seen) {
    if (value.length === 0) return "[]";
    var parts = [];
    for (var i = 0; i < value.length; i++) {
      parts.push(formatInner(value[i], depth + 1, seen));
    }
    return "[ " + parts.join(", ") + " ]";
  }

  function formatMap(value, depth, seen) {
    var parts = [];
    value.forEach(function (entryValue, entryKey) {
      parts.push(
        formatInner(entryKey, depth + 1, seen) + " => " + formatInner(entryValue, depth + 1, seen)
      );
    });
    return "Map(" + value.size + ")" + (parts.length ? " { " + parts.join(", ") + " }" : " {}");
  }

  function formatSet(value, depth, seen) {
    var parts = [];
    value.forEach(function (entryValue) {
      parts.push(formatInner(entryValue, depth + 1, seen));
    });
    return "Set(" + value.size + ")" + (parts.length ? " { " + parts.join(", ") + " }" : " {}");
  }

  function formatObject(value, depth, seen) {
    var keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    var parts = keys.map(function (key) {
      var printedKey = isIdentifier(key) ? key : quote(key);
      return printedKey + ": " + formatInner(value[key], depth + 1, seen);
    });
    return "{ " + parts.join(", ") + " }";
  }

  function formatInner(value, depth, seen) {
    if (value === null) return "null";
    var kind = typeof value;
    if (kind === "string") return quote(value);
    if (kind === "undefined") return "undefined";
    if (kind === "number" || kind === "boolean") return String(value);
    if (kind === "bigint") return String(value) + "n";
    if (kind === "symbol") return String(value);
    if (kind === "function") return "[Function: " + (value.name || "anonymous") + "]";

    // Object territory from here on.
    if (seen.indexOf(value) !== -1) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[Object]";
    if (value instanceof Error) return value.stack || String(value);

    seen.push(value);
    var out;
    if (Array.isArray(value)) out = formatArray(value, depth, seen);
    else if (value instanceof Map) out = formatMap(value, depth, seen);
    else if (value instanceof Set) out = formatSet(value, depth, seen);
    else if (value instanceof Date) out = value.toISOString();
    else out = formatObject(value, depth, seen);
    seen.pop();
    return out;
  }

  /** Top-level formatting: strings print as-is (like Node's console.log). */
  function formatValue(value) {
    if (typeof value === "string") return value;
    return formatInner(value, 0, []);
  }

  // --- Output capture ------------------------------------------------------

  var output = { stdout: "", stderr: "", truncated: false };

  function appendOutput(stream, text) {
    var current = output[stream];
    if (current.length >= MAX_OUTPUT) {
      output.truncated = true;
      return;
    }
    var room = MAX_OUTPUT - current.length;
    if (text.length > room) {
      output[stream] = current + text.slice(0, room);
      output.truncated = true;
    } else {
      output[stream] = current + text;
    }
  }

  function argsToLine(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(formatValue(args[i]));
    return parts.join(" ") + "\n";
  }

  function installConsole() {
    var toStdout = function () {
      appendOutput("stdout", argsToLine(arguments));
    };
    var toStderr = function () {
      appendOutput("stderr", argsToLine(arguments));
    };
    console.log = toStdout;
    console.info = toStdout;
    console.debug = toStdout;
    console.warn = toStderr;
    console.error = toStderr;
  }

  // --- Network lockdown ----------------------------------------------------

  var lockedDown = false;

  // Called at the start of run(), NOT at script load: the TS runner still
  // needs importScripts at worker startup to pull in the compiler. User code
  // never executes before this has run.
  function lockdownNetwork() {
    if (lockedDown) return;
    lockedDown = true;
    var blocked = function () {
      throw new Error("Network access is disabled in the CodeShift sandbox");
    };
    self.fetch = blocked;
    self.XMLHttpRequest = blocked;
    self.WebSocket = blocked;
    self.importScripts = blocked;
  }

  // --- Minimal Node shim ---------------------------------------------------

  // The AI targets Node 22 (the Docker tier), so converted code may use
  // process.stdout.write / process.exit. Map those onto the sandbox; require()
  // fails with a clear message instead of a bare ReferenceError.
  // ponytail: process.exit is a thrown sentinel, so a user catch-all can swallow it.
  var EXIT = { exit: true };

  function installNodeShim() {
    var write = function (stream) {
      return function (text) {
        appendOutput(stream, String(text));
        return true;
      };
    };
    var proc = {
      argv: ["node", "main.js"],
      env: {},
      platform: "browser",
      exitCode: undefined,
      stdout: { write: write("stdout") },
      stderr: { write: write("stderr") },
      exit: function (code) {
        if (code !== undefined) proc.exitCode = code;
        throw EXIT;
      },
    };
    self.process = proc;
    self.require = function (name) {
      throw new Error(
        "require('" + name + "') isn't available in the in-browser sandbox. Start Docker Desktop to run full Node.js."
      );
    };
    return proc;
  }

  // --- Runner --------------------------------------------------------------

  async function run(code) {
    lockdownNetwork();
    output = { stdout: "", stderr: "", truncated: false };
    installConsole();
    var proc = installNodeShim();

    var exitCode = 0;
    var body = '"use strict";\n' + code;
    try {
      // Wrapped in an async IIFE so top-level await works and rejections are
      // caught here rather than crashing the worker.
      await new Function("return (async () => {" + "\n" + body + "\n" + "})()")();
      exitCode = Number(proc.exitCode) || 0;
    } catch (error) {
      if (error === EXIT) {
        exitCode = Number(proc.exitCode) || 0;
      } else {
        appendOutput("stderr", error && error.stack ? error.stack : String(error));
        exitCode = 1;
      }
    }

    return {
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: exitCode,
      truncated: output.truncated,
    };
  }

  self.__csExec = { run: run, formatValue: formatValue };
})();
