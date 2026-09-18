import Anthropic from "@anthropic-ai/sdk";
import type { CompleteParams, CompleteResult, LLMProvider, StreamChunk } from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
    this.client = new Anthropic({ apiKey });
  }

  async complete({ model, system, messages, maxTokens = 1024, temperature }: CompleteParams): Promise<CompleteResult> {
    const response = await this.client.messages.create({
      model,
      system,
      messages: messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
    });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream({ model, system, messages, maxTokens = 1024, temperature }: CompleteParams): AsyncGenerator<StreamChunk> {
    const stream = this.client.messages.stream({
      model,
      system,
      messages: messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
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
