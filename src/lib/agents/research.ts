import type { ContentBlock } from "@/lib/llm/types";

export interface ExtractedSource {
  url: string;
  title?: string;
}

interface WebSearchCallRaw {
  type: "web_search_call";
  action?:
    | { type: "search"; sources?: Array<{ type: "url"; url: string }> }
    | { type: "open_page"; url?: string | null }
    | { type: "find_in_page"; url?: string };
}

/**
 * OpenAI's server-side web_search tool resolves entirely on its own
 * infrastructure — the result just shows up as a `web_search_call` output
 * item, which our provider passes through as an opaque content block (see
 * OpenAIProvider.fromOpenAIItem). This is the one place that knows that
 * item's shape, so the Research Agent can persist what was actually found
 * (Master Brief §10: "URL保存") without the LLM abstraction layer having to
 * model every vendor's result schema.
 */
export function extractSourcesFromContent(blocks: ContentBlock[]): ExtractedSource[] {
  const sources: ExtractedSource[] = [];

  for (const block of blocks) {
    if (block.type !== "opaque" || block.providerType !== "web_search_call") continue;
    const action = (block.raw as WebSearchCallRaw).action;
    if (!action) continue;

    if (action.type === "search" && Array.isArray(action.sources)) {
      for (const source of action.sources) {
        if (source?.type === "url" && typeof source.url === "string") sources.push({ url: source.url });
      }
    } else if ((action.type === "open_page" || action.type === "find_in_page") && action.url) {
      sources.push({ url: action.url });
    }
  }

  return sources;
}
