export type LLMRole = "user" | "assistant" | "system";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export type StreamChunk = { type: "text"; text: string } | { type: "done"; usage?: TokenUsage };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompleteParams {
  model: string;
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  usage: TokenUsage;
}

/**
 * Provider-agnostic boundary (Master Brief §16/§18). Every concrete LLM
 * vendor implements this so the Model Router and Agents never depend on a
 * specific SDK.
 */
export interface LLMProvider {
  readonly name: string;
  complete(params: CompleteParams): Promise<CompleteResult>;
  stream(params: CompleteParams): AsyncGenerator<StreamChunk>;
}
