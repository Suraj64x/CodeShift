import type {
  AIProviderId,
  AIStreamEvent,
  ConvertRequestBody,
  FixRequestBody,
} from "@/lib/types";

/**
 * Contract every AI backend implements. Each provider streams the same
 * `AIStreamEvent` shapes, so the routes and the client pipeline never care
 * which one is active. The API key is resolved by the route (request header,
 * else .env.local) and passed in per call — providers never read it themselves.
 */
export interface AIProvider {
  id: AIProviderId;
  name: string;
  convert(req: ConvertRequestBody, apiKey: string): AsyncGenerator<AIStreamEvent>;
  fix(req: FixRequestBody, apiKey: string): AsyncGenerator<AIStreamEvent>;
  /** Model ids available to this key. Throws an Error with a user-facing message. */
  listModels(apiKey: string): Promise<string[]>;
}
