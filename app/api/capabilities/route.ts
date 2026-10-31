// GET /api/capabilities — what this deployment can actually do: AI provider
// configuration plus Docker/browser execution availability per language.

import { getCapabilities } from "@/lib/execution/capabilities";
import type { Capabilities } from "@/lib/types";

export async function GET(): Promise<Response> {
  const capabilities: Capabilities = await getCapabilities();
  return Response.json(capabilities, {
    headers: { "Cache-Control": "no-store" },
  });
}
