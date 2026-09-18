export type LLMRole = "user" | "assistant" | "system";

/**
 * Provider-agnostic content blocks. Only the shapes every provider needs to
 * share (text, our own custom tool calls/results) are modeled explicitly.
 * Anything provider-specific (e.g. a vendor's server-side web_search result
 * item) round-trips as `opaque` so it can still be echoed back on the next
 * turn without this layer having to model every vendor's schema.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "opaque"; providerType: string; raw: unknown };

export interface LLMMessage {
  role: LLMRole;
  content: string | ContentBlock[];
}

export interface LLMToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type StopReason = "end_turn" | "tool_use" | "pause_turn" | "max_tokens" | "refusal" | "other";

export interface CompleteParams {
  model: string;
  system?: string;
  messages: LLMMessage[];
  /** Our own client-executed tools (Planning/Creation agents etc.). */
  tools?: LLMToolDef[];
  /**
   * Capability flag, not a provider-specific tool type: "give this call the
   * ability to search and read the live web." Each provider maps it to
   * whatever mechanism it has (Anthropic: server-side web_search/web_fetch).
   */
  enableWebSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  content: ContentBlock[];
  stopReason: StopReason;
  usage: TokenUsage;
}

export type StreamChunk = { type: "text"; text: string } | { type: "done"; usage?: TokenUsage };

/**
 * Provider-agnostic boundary (Master Brief §16/§18). Every concrete LLM
 * vendor implements this so the Agent Loop and Model Router never depend on
 * a specific SDK.
 */
export interface LLMProvider {
  readonly name: string;
  /** Supports tools and multi-turn tool-use content blocks. */
  complete(params: CompleteParams): Promise<CompleteResult>;
  /** Plain token-streaming for text-only turns; throws if given tools. */
  stream(params: CompleteParams): AsyncGenerator<StreamChunk>;
}
