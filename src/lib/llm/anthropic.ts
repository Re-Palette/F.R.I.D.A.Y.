import Anthropic from "@anthropic-ai/sdk";
import type {
  CompleteParams,
  CompleteResult,
  ContentBlock,
  LLMMessage,
  LLMProvider,
  StopReason,
  StreamChunk,
} from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
    this.client = new Anthropic({ apiKey });
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const {
      model,
      system,
      messages,
      tools,
      enableWebSearch,
      maxTokens = 4096,
      temperature,
      onText,
    } = params;

    const anthropicTools = buildAnthropicTools(tools, enableWebSearch, model);

    const body = {
      model,
      system,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(toAnthropicMessage),
      tools: anthropicTools.length ? anthropicTools : undefined,
    };

    // Same request either way, and finalMessage() assembles the same Message
    // that create() returns — so everything below this point, tool blocks
    // included, is unchanged. The only difference is that the text is handed
    // over as it is written rather than all at the end.
    const response = await (onText ? this.streamed(body, onText) : this.client.messages.create(body));

    return {
      content: response.content.map(fromAnthropicBlock),
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async streamed(
    body: Anthropic.Messages.MessageCreateParamsNonStreaming,
    onText: (text: string) => void
  ): Promise<Anthropic.Message> {
    const stream = this.client.messages.stream(body);
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }
    return stream.finalMessage();
  }

  async *stream(params: CompleteParams): AsyncGenerator<StreamChunk> {
    if (params.tools?.length || params.enableWebSearch) {
      throw new Error("AnthropicProvider.stream() does not support tools; use complete() for tool-calling turns.");
    }

    const stream = this.client.messages.stream({
      model: params.model,
      system: params.system,
      max_tokens: params.maxTokens ?? 1536,
      temperature: params.temperature,
      messages: params.messages.map(toAnthropicMessage),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      },
    };
  }
}

// The dynamic-filtering server tools only run on Opus 4.6+, Sonnet 4.6+ and
// Fable. Naming them alongside any other model makes the API reject the
// whole request, which matters here because the router deliberately sends
// ordinary chat to the cheapest tier (Haiku) — that model needs the basic
// variants instead.
const DYNAMIC_FILTERING_MODELS = [
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-mythos-5",
];

function buildAnthropicTools(
  tools: CompleteParams["tools"],
  enableWebSearch: boolean | undefined,
  model: string
) {
  const custom: Anthropic.Messages.ToolUnion[] = (tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  if (!enableWebSearch) return custom;

  // Anthropic-hosted server tools: search + fetch run entirely on
  // Anthropic's infrastructure and their results arrive as content blocks
  // in the same response, no client execution needed (see research agent).
  const dynamic = DYNAMIC_FILTERING_MODELS.some((m) => model.startsWith(m));

  return [
    ...custom,
    {
      type: dynamic ? "web_search_20260209" : "web_search_20250305",
      name: "web_search",
      max_uses: 5,
    },
    {
      type: dynamic ? "web_fetch_20260209" : "web_fetch_20250910",
      name: "web_fetch",
      max_uses: 5,
    },
  ] as Anthropic.Messages.ToolUnion[];
}

function toAnthropicMessage(m: LLMMessage): Anthropic.MessageParam {
  const role = m.role === "system" ? "user" : m.role;
  if (typeof m.content === "string") return { role, content: m.content };
  return { role, content: m.content.map(toAnthropicBlockParam) };
}

function toAnthropicBlockParam(b: ContentBlock): Anthropic.ContentBlockParam {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text };
    case "tool_use":
      return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    case "tool_result":
      return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
    case "opaque":
      return b.raw as Anthropic.ContentBlockParam;
  }
}

function fromAnthropicBlock(b: Anthropic.ContentBlock): ContentBlock {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.type === "tool_use") {
    return { type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> };
  }
  return { type: "opaque", providerType: b.type, raw: b };
}

function mapStopReason(reason: Anthropic.Message["stop_reason"]): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "pause_turn":
      return "pause_turn";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}
