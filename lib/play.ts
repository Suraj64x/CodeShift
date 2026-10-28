// The Play window's page: a network-less document with a canvas, embedded by
// the parent as <iframe sandbox="allow-scripts" srcdoc=…>. The sandbox gives it
// an opaque origin (no access to this site's storage, cookies or same-origin
// API routes); the CSP below blocks every network request. Console output is
// relayed to the parent with postMessage.
// Self-check: `node lib/play.check.ts`

export const PLAY_MESSAGE = "codeshift-play";

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";

function boot(lineOffset: number): string {
  return `(function () {
  var send = function (stream, args) {
    var text = Array.prototype.map.call(args, function (value) {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch (e) { return String(value); }
    }).join(" ");
    parent.postMessage({ source: "${PLAY_MESSAGE}", stream: stream, text: text }, "*");
  };
  console.log = console.info = console.debug = function () { send("stdout", arguments); };
  console.warn = console.error = function () { send("stderr", arguments); };
  window.addEventListener("error", function (event) {
    send("stderr", [event.message + (event.lineno ? " (line " + (event.lineno - ${lineOffset}) + ")" : "")]);
  });
  window.addEventListener("unhandledrejection", function (event) {
    send("stderr", ["Unhandled promise rejection: " + event.reason]);
  });
  window.canvas = document.getElementById("canvas");
  window.ctx = window.canvas.getContext("2d");
  window.canvas.focus();
})();`;
}

/** Keep user code from closing its <script> element early. */
function escapeScript(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** Full HTML for the Play iframe running `js` (plain JavaScript). */
export function buildPlayDocument(js: string): string {
  const head = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { display: block; max-width: 100%; max-height: 100%; outline: none; image-rendering: pixelated; }
</style>
</head>
<body>
<canvas id="canvas" width="480" height="640" tabindex="0"></canvas>
<script>
`;
  // The user's script starts on its own line; error line numbers are made
  // relative to it.
  const beforeUser = `${head}${boot(0)}
</script>
<script>
`;
  const lineOffset = beforeUser.split("\n").length - 1;
  return `${head}${boot(lineOffset)}
</script>
<script>
${escapeScript(js)}
</script>
</body>
</html>`;
}
