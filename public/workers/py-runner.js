/*
 * CodeShift browser sandbox — Python runner (classic worker) using Pyodide
 * (CPython 3.12 compiled to WebAssembly). The runtime is a one-time ~10 MB
 * download; after that it stays warm for the life of this worker.
 *
 * Protocol:
 *   host → worker:  { id, code }
 *   worker → host:  { id, type: "status", text }                    (progress)
 *                   { id, type: "result", stdout, stderr, exitCode,
 *                     truncated, infraError? }                      (final)
 *
 * infraError is only set when the sandbox itself broke (runtime failed to
 * download) — never for errors in the user's program.
 */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

var MAX_OUTPUT = 64 * 1024;
var PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

var pyodidePromise = null;
var pyodideReady = false;

// Kept privately so the package loader (and only it) can download wheels
// after the network is locked for user code.
var realFetch = self.fetch;
var blockedFetch = function () {
  throw new Error("Network access is disabled in the CodeShift sandbox");
};

function lockdownNetwork() {
  var blocked = blockedFetch;
  self.fetch = blocked;
  self.XMLHttpRequest = blocked;
  self.WebSocket = blocked;
  self.importScripts = blocked;
}

function ensurePyodide() {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL }).then(function (pyodide) {
      pyodideReady = true;
      // Lock the network only AFTER the runtime loads — Pyodide needs fetch
      // to download itself. User code never runs before this point.
      lockdownNetwork();
      return pyodide;
    });
    // The warm-up load may fail with nobody awaiting it (e.g. offline). Keep
    // that from becoming an unhandled rejection; the next run still sees the
    // rejected promise, resets it, and reports the failure properly.
    pyodidePromise.catch(function () {});
  }
  return pyodidePromise;
}

// Start the download as soon as the worker exists: creating this worker
// (warmBrowserRuntime on the host) is what pre-warms Python.
ensurePyodide();

function makeBuffer() {
  return {
    text: "",
    truncated: false,
    append: function (chunk) {
      if (this.text.length >= MAX_OUTPUT) {
        this.truncated = true;
        return;
      }
      var room = MAX_OUTPUT - this.text.length;
      if (chunk.length > room) {
        this.text += chunk.slice(0, room);
        this.truncated = true;
      } else {
        this.text += chunk;
      }
    },
  };
}

/**
 * Load any of Pyodide's ~300 prebuilt packages the program imports (pygame-ce,
 * numpy, pandas, matplotlib…) from the pinned Pyodide CDN, before the program
 * runs. Imports Pyodide doesn't ship are left alone, so the program reports
 * its own ModuleNotFoundError. Downloads are cached by the browser.
 */
async function installImports(pyodide, code, id) {
  // Network is reopened only for Pyodide's own loader and relocked before any
  // user code runs. ponytail: asyncio tasks left by a previous program could
  // run during this await; restart the worker per run if that ever matters.
  self.fetch = realFetch;
  try {
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: function (msg) {
        if (/^Loading /.test(msg)) {
          self.postMessage({ id: id, type: "status", text: msg.replace(/^Loading/, "Installing") + "…" });
        }
      },
      errorCallback: function () {},
    });
  } catch {
    // Unparseable code or a failed download: run anyway and let Python report.
  } finally {
    self.fetch = blockedFetch;
  }
}

self.onmessage = async function (event) {
  var message = event.data || {};
  var id = message.id;

  if (!pyodideReady) {
    self.postMessage({
      id: id,
      type: "status",
      text: "Loading Python runtime (one-time, ~10 MB)…",
    });
  }

  var pyodide;
  try {
    pyodide = await ensurePyodide();
  } catch (error) {
    pyodidePromise = null; // let the next run retry the download
    self.postMessage({
      id: id,
      type: "result",
      stdout: "",
      stderr: "",
      exitCode: null,
      truncated: false,
      infraError:
        "The Python runtime failed to load: " +
        (error && error.message ? error.message : String(error)),
    });
    return;
  }

  var code = String(message.code == null ? "" : message.code);
  await installImports(pyodide, code, id);

  var out = makeBuffer();
  var err = makeBuffer();
  var exitCode = 0;

  pyodide.setStdout({
    batched: function (line) {
      out.append(line + "\n");
    },
  });
  pyodide.setStderr({
    batched: function (line) {
      err.append(line + "\n");
    },
  });

  // Run each program in a fresh globals dict so one run's variables can't
  // leak into the next (the worker — and the interpreter — stay warm).
  var namespace = pyodide.globals.get("dict")();
  var fatal = false;
  try {
    pyodide.runPython(code, { globals: namespace });
  } catch (error) {
    if (error && error.pyodide_fatal_error) {
      // The interpreter itself died (e.g. pygame.init() looking for a browser
      // screen a worker doesn't have) and can never run again — the host
      // replaces this worker before the next run.
      fatal = true;
      err.append(
        "The Python runtime crashed (" + error.name + ": " + error.message + ").\n" +
          "Programs that open a window, like pygame games, need a screen, which this sandbox doesn't have. " +
          "Python restarts for the next run.\n"
      );
    } else {
      // PythonError.message carries the full Python traceback.
      err.append(error && error.message ? error.message : String(error));
    }
    exitCode = 1;
  } finally {
    try {
      namespace.destroy();
    } catch {
      // Already gone with a crashed interpreter.
    }
  }

  self.postMessage({
    id: id,
    type: "result",
    stdout: out.text,
    stderr: err.text,
    exitCode: exitCode,
    truncated: out.truncated || err.truncated,
    restart: fatal,
  });
};
