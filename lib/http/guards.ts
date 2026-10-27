// Shared guards for the code-executing / credit-spending API routes.
// These endpoints run user code and call a paid AI API, so we (1) refuse
// cross-site callers — a drive-by page must not be able to drive the local
// dev server — and (2) reject oversized bodies BEFORE request.json() buffers
// them into memory.

/** Generous ceiling, comfortably above the 100 KB source-code cap. */
export const MAX_BODY_BYTES = 200_000;

/**
 * Returns a Response to short-circuit with, or null when the request may
 * proceed. Call at the very top of a POST handler, before reading the body.
 */
export function guardRequest(request: Request): Response | null {
  // Same-origin only. Browsers send Sec-Fetch-Site on every request; "none"
  // means a direct navigation / same-machine tool (no Origin), "same-origin"
  // is our own UI. Anything else is a cross-site caller.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json(
      { error: "Cross-site requests are not allowed for this endpoint." },
      { status: 403 },
    );
  }

  // Reject before buffering when the length is declared. (Chunked bodies with
  // no Content-Length still hit the post-parse size check in each route.)
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  return null;
}
