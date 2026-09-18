import OpenAI from "openai";
import type {
  CompleteParams,
  CompleteResult,
  ContentBlock,
  LLMMessage,
  LLMProvider,
  StopReason,
  StreamChunk,
} from "./types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
    this.client = new OpenAI({ apiKey });
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const { model, system, messages, tools, enableWebSearch, maxTokens = 4096, temperature } = params;

    const response = await this.client.responses.create({
      model,
      instructions: system,
      input: toOpenAIInput(messages),
      tools: buildOpenAITools(tools, enableWebSearch),
      include: enableWebSearch ? ["web_search_call.action.sources"] : undefined,
      max_output_tokens: maxTokens,
      temperature,
    });

    if (response.error) {
      throw new Error(`OpenAI response error (${response.error.code}): ${response.error.message}`);
    }

    const content = response.output.flatMap(fromOpenAIItem);

    return {
      content,
      stopReason: resolveStopReason(response, content),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  }

  async *stream(params: CompleteParams): AsyncGenerator<StreamChunk> {
    if (params.tools?.length || params.enableWebSearch) {
      throw new Error("OpenAIProvider.stream() does not support tools; use complete() for tool-calling turns.");
    }

    const stream = await this.client.responses.create({
      model: params.model,
      instructions: params.system,
      input: toOpenAIInput(params.messages),
      max_output_tokens: params.maxTokens ?? 1536,
      temperature: params.temperature,
      stream: true,
    });

    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield { type: "text", text: event.delta };
      } else if (event.type === "response.completed") {
        usage = {
          inputTokens: event.response.usage?.input_tokens ?? 0,
          outputTokens: event.response.usage?.output_tokens ?? 0,
        };
      }
    }

    yield { type: "done", usage };
  }
}

function buildOpenAITools(
  tools: CompleteParams["tools"],
  enableWebSearch?: boolean
): OpenAI.Responses.Tool[] | undefined {
  const custom: OpenAI.Responses.Tool[] = (tools ?? []).map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: false,
  }));

  if (enableWebSearch) custom.push({ type: "web_search" });

  return custom.length ? custom : undefined;
}

function toOpenAIInput(messages: LLMMessage[]): OpenAI.Responses.ResponseInputItem[] {
  const items: OpenAI.Responses.ResponseInputItem[] = [];

  for (const m of messages) {
    if (typeof m.content === "string") {
      items.push({ type: "message", role: m.role, content: m.content });
      continue;
    }

    for (const block of m.content) {
      switch (block.type) {
        case "text":
          items.push({ type: "message", role: m.role, content: block.text });
          break;
        case "tool_use":
          items.push({
            type: "function_call",
            call_id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          });
          break;
        case "tool_result":
          items.push({ type: "function_call_output", call_id: block.toolUseId, output: block.content });
          break;
        case "opaque":
          items.push(block.raw as OpenAI.Responses.ResponseInputItem);
          break;
      }
    }
  }

  return items;
}

/**
 * Unlike Anthropic's content blocks (one assistant message can hold
 * text + tool_use together), the Responses API returns text and function
 * calls as separate sibling items in `output` — flatten each item into our
 * generic block(s) so the Agent Loop can treat both providers the same way.
 */
function fromOpenAIItem(item: OpenAI.Responses.ResponseOutputItem): ContentBlock[] {
  if (item.type === "message") {
    return item.content.map((c): ContentBlock => {
      if (c.type === "output_text") return { type: "text", text: c.text };
      return { type: "opaque", providerType: c.type, raw: c };
    });
  }

  if (item.type === "function_call") {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(item.arguments || "{}");
    } catch {
      // Malformed JSON from a non-strict tool call — the tool handler's own
      // light validation will reject the (now-empty) input gracefully.
      input = {};
    }
    return [{ type: "tool_use", id: item.call_id, name: item.name, input }];
  }

  return [{ type: "opaque", providerType: item.type, raw: item }];
}

function resolveStopReason(response: OpenAI.Responses.Response, content: ContentBlock[]): StopReason {
  const hasRefusal = content.some((b) => b.type === "opaque" && b.providerType === "refusal");
  if (hasRefusal) return "refusal";

  if (response.incomplete_details?.reason === "max_output_tokens") return "max_tokens";

  const hasToolUse = content.some((b) => b.type === "tool_use");
  if (hasToolUse) return "tool_use";

  if (!response.status || response.status === "completed") return "end_turn";
  return "other";
}
