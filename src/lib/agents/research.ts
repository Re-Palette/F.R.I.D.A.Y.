import type { ContentBlock } from "@/lib/llm/types";

export interface ExtractedSource {
  url: string;
  title?: string;
}

/**
 * Anthropic's server-side web_search/web_fetch tools resolve entirely on
 * their infrastructure — results just show up as opaque content blocks in
 * the response (see AnthropicProvider.fromAnthropicBlock). This is the one
 * place that knows their shape, so the Research Agent can persist what was
 * actually found (Master Brief §10: "URL保存") without the LLM abstraction
 * layer having to model every vendor's result schema.
 */
export function extractSourcesFromContent(blocks: ContentBlock[]): ExtractedSource[] {
  const sources: ExtractedSource[] = [];

  for (const block of blocks) {
    if (block.type !== "opaque") continue;
    const raw = block.raw as { type?: string; content?: unknown };

    if (block.providerType === "web_search_tool_result" && Array.isArray(raw.content)) {
      for (const result of raw.content as Array<{ type?: string; url?: string; title?: string }>) {
        if (result?.type === "web_search_result" && typeof result.url === "string") {
          sources.push({ url: result.url, title: result.title });
        }
      }
    }

    if (block.providerType === "web_fetch_tool_result") {
      const content = raw.content as { type?: string; url?: string } | undefined;
      if (content?.type === "web_fetch_result" && typeof content.url === "string") {
        sources.push({ url: content.url });
      }
    }
  }

  return sources;
}
