import { db } from "@/lib/db/client";
import { documents, sources } from "@/lib/db/schema";
import { routeModel } from "@/lib/llm/router";
import type { ToolDefinition } from "./types";

const DOCUMENT_TYPES = ["report", "email", "sns_post", "slide", "script", "note", "other"] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];

const PLACEHOLDER_PATTERNS = [/\[TODO/i, /\[INSERT/i, /\[PLACEHOLDER/i, /\{\{.*\}\}/, /lorem ipsum/i];

const VERIFICATION_SYSTEM_PROMPT = `あなたはF.R.I.D.A.Y.のSelf-Verification担当です。
これから提示されるドラフト（種類・タイトル・本文）を、ユーザーに提出してよい品質かチェックしてください。
確認観点: 依頼内容を満たしているか、明らかな矛盾や欠落情報がないか、
type=emailなら宛先/件名相当の情報が本文から読み取れるか、
数字や固有名詞に不自然な点がないか。

出力は必ず以下のJSON形式のみ:
{ "ok": boolean, "issues": string[] }
問題がなければ issues は空配列にすること。軽微な改善提案程度では ok=false にしない。
明らかな欠落・矛盾・未完成（プレースホルダーが残っている等）がある場合のみ ok=false にする。`;

interface VerificationOutput {
  ok: boolean;
  issues: string[];
}

function parseVerificationJson(text: string): VerificationOutput {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned);
  return { ok: Boolean(parsed.ok), issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
}

async function verifyDraft(type: DocumentType, title: string, content: string): Promise<VerificationOutput> {
  const heuristicIssues: string[] = [];
  if (content.trim().length < 20) heuristicIssues.push("本文が極端に短く、内容が不足しています。");
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content) || pattern.test(title)) {
      heuristicIssues.push("プレースホルダーとみられる未完成の記述が残っています。");
      break;
    }
  }
  if (heuristicIssues.length) return { ok: false, issues: heuristicIssues };

  const { provider, model } = routeModel("verification");
  try {
    const result = await provider.complete({
      model,
      system: VERIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `type: ${type}\ntitle: ${title}\n---\n${content}` }],
      maxTokens: 1024,
    });
    const text = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    return parseVerificationJson(text);
  } catch {
    // Verification is a quality gate, not a hard dependency — if it errors,
    // fail open rather than blocking the whole Creation Agent turn.
    return { ok: true, issues: [] };
  }
}

export const createDocumentTool: ToolDefinition = {
  name: "create_document",
  description:
    "Draft and save a document (report, email, sns_post, slide outline, script, or note). The draft is self-checked before saving — if it's incomplete or contradicts the goal, this returns the issues instead of saving so you can revise and call it again.",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: DOCUMENT_TYPES },
      title: { type: "string" },
      content: { type: "string", description: "The full drafted content." },
      sources: {
        type: "array",
        description: "URLs used while researching this document, if any.",
        items: {
          type: "object",
          properties: { url: { type: "string" }, title: { type: "string" } },
          required: ["url"],
        },
      },
    },
    required: ["type", "title", "content"],
  },
  level: 1,
  async execute(input, ctx) {
    const type = DOCUMENT_TYPES.includes(input.type as DocumentType) ? (input.type as DocumentType) : "other";
    const title = String(input.title ?? "").trim();
    const content = String(input.content ?? "").trim();
    if (!title || !content) return { ok: false, content: "title and content are required" };

    const verification = await verifyDraft(type, title, content);
    if (!verification.ok) {
      return {
        ok: false,
        content: `Draft needs revision before it can be saved: ${verification.issues.join("; ")}`,
      };
    }

    const [doc] = await db.insert(documents).values({ userId: ctx.userId, type, title, content }).returning();

    const inputSources = Array.isArray(input.sources) ? (input.sources as Array<{ url?: string; title?: string }>) : [];
    const validSources = inputSources.filter((s): s is { url: string; title?: string } => Boolean(s.url));
    if (validSources.length) {
      await db.insert(sources).values(validSources.map((s) => ({ documentId: doc.id, url: s.url, title: s.title })));
    }

    return { ok: true, content: `Saved ${type} "${title}" (document id ${doc.id}).` };
  },
};
