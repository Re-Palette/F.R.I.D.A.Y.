import { Client } from "@notionhq/client";

let cached: Client | null = null;

function getClient(): Client {
  if (cached) return cached;
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY is not set. See .env.example for how to create a Notion integration.");
  }
  cached = new Client({ auth: token });
  return cached;
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID);
}

export interface NotionPageResult {
  pageId: string;
  url: string | null;
}

/**
 * Creates a page under the configured parent page (Master Brief §11: Notion
 * as a Creation Agent output destination). Lazily reads env vars on first
 * real call rather than at module load — see the same pattern/rationale in
 * src/lib/db/client.ts (a module-scope throw here would crash `next build`,
 * not just requests that actually need Notion).
 */
export async function createNotionPage(title: string, markdown: string): Promise<NotionPageResult> {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    throw new Error("NOTION_PARENT_PAGE_ID is not set. See .env.example.");
  }

  const client = getClient();
  const response = await client.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ type: "text", text: { content: title } }] },
    },
    markdown,
  });

  return {
    pageId: response.id,
    url: "url" in response ? response.url : null,
  };
}
