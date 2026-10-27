import { getProvider, missingKeyMessage, resolveKey } from "@/lib/ai";
import { guardRequest } from "@/lib/http/guards";
import { AI_KEY_HEADER, isProviderId } from "@/lib/types";

/**
 * POST /api/ai/models — body: { provider }. Key in the x-ai-key header (or
 * .env.local). Lists the models that key can use; doubles as Settings' "Test
 * connection" because listing fails on a bad key. Free — no tokens are spent.
 * 200 { models: string[] } · 400 { error } bad request · 502 { error } provider failure.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const id = (raw as { provider?: unknown } | null)?.provider;
  if (!isProviderId(id)) {
    return Response.json({ error: "provider is missing or not supported." }, { status: 400 });
  }

  const apiKey = resolveKey(id, request.headers.get(AI_KEY_HEADER));
  if (!apiKey) return Response.json({ error: missingKeyMessage(id) }, { status: 400 });

  try {
    return Response.json({ models: await getProvider(id).listModels(apiKey) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Couldn't load models." },
      { status: 502 },
    );
  }
}
