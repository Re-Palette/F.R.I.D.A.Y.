import { isDriveConfigured, readDriveFile, searchDriveFiles } from "@/lib/integrations/google-drive";
import type { ToolDefinition } from "./types";

const NOT_CONNECTED = "Google Drive is not connected yet. Tell the user this isn't set up.";

// Enough for the model to work with, short enough not to swallow the whole
// context window on one long document.
const MAX_TEXT = 12_000;

export const searchDriveTool: ToolDefinition = {
  name: "search_drive",
  description:
    "Search the user's Google Drive by file name and contents. Read-only. Use this when the user refers to " +
    "a document, sheet or file of theirs rather than guessing what it says.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words to look for in file names and contents." },
      maxResults: { type: "number", description: "How many files to return (default 10, max 25)." },
    },
    required: ["query"],
  },
  level: 1,
  async execute(input) {
    if (!isDriveConfigured()) return { ok: false, content: NOT_CONNECTED };

    const query = String(input.query ?? "").trim();
    if (!query) return { ok: false, content: "query is required" };
    const maxResults = typeof input.maxResults === "number" ? input.maxResults : 10;

    try {
      const files = await searchDriveFiles(query, maxResults);
      if (!files.length) return { ok: true, content: `No files matched: ${query}` };
      return {
        ok: true,
        content: files
          .map((f) => `- id=${f.id}\n  name: ${f.name}\n  type: ${f.mimeType}\n  modified: ${f.modifiedTime}`)
          .join("\n"),
      };
    } catch (err) {
      return { ok: false, content: `Drive search failed: ${(err as Error).message}` };
    }
  },
};

export const readDriveFileTool: ToolDefinition = {
  name: "read_drive_file",
  description:
    "Read the text of one Google Drive file by id (ids come from search_drive). Google Docs, Sheets and " +
    "Slides are exported as text; binary formats report that they can't be read. Read-only.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "File id from search_drive." } },
    required: ["id"],
  },
  level: 1,
  async execute(input) {
    if (!isDriveConfigured()) return { ok: false, content: NOT_CONNECTED };

    const id = String(input.id ?? "").trim();
    if (!id) return { ok: false, content: "id is required" };

    try {
      const { file, text } = await readDriveFile(id);
      const truncated = text.length > MAX_TEXT;
      return {
        ok: true,
        content:
          `name: ${file.name}\ntype: ${file.mimeType}\n\n${text.slice(0, MAX_TEXT)}` +
          (truncated ? `\n\n(以降 ${text.length - MAX_TEXT} 文字を省略しました)` : ""),
      };
    } catch (err) {
      return { ok: false, content: `Reading the file failed: ${(err as Error).message}` };
    }
  },
};
