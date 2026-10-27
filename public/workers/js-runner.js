/*
 * CodeShift browser sandbox — JavaScript runner (classic worker).
 *
 * Protocol:
 *   host → worker:  { id, code }
 *   worker → host:  { id, type: "result", stdout, stderr, exitCode, truncated }
 */
importScripts("/workers/js-exec-core.js");

self.onmessage = function (event) {
  var message = event.data || {};
  var id = message.id;

  self.__csExec.run(String(message.code == null ? "" : message.code)).then(function (result) {
    self.postMessage({
      id: id,
      type: "result",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
    });
  });
};
