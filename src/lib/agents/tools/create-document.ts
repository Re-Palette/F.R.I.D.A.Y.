import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { routeModel, type ModelTier } from "@/lib/llm/router";
import { createNotionPage, isNotionConfigured } from "@/lib/integrations/notion";
import type { ToolDefinition } from "./types";

const DOCUMENT_TYPES = ["report", "email", "sns_post", "slide", "script", "note", "other"] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];

const PLACEHOLDER_PATTERNS = [/\[TODO/i, /\[INSERT/i, /\[PLACEHOLDER/i, /\{\{.*\}\}/, /lorem ipsum/i];

const CREATION_SYSTEM_PROMPT = `あなたはF.R.I.D.A.Y.のCreation Agentです。
与えられたtype・title・briefと、あれば調査結果(sourceMaterial)を元に、
そのまま提出できる完成度の本文を書いてください。
- 前置き（「以下が本文です」等）や説明を付けず、本文そのものだけを出力する。
- type=emailなら宛先・件名相当の情報も本文中に自然に含める。
- sourceMaterialがある場合はそれに基づいた具体的な内容にし、根拠のない数字・固有名詞を作らない。`;

const VERIFICATION_SYSTEM_PROMPT = `あなたはF.R.I.D.A.Y.のSelf-Verification担当です。
これから提示されるドラフト（種類・タイトル・本文）を、ユーザーに提出してよい品質かチェックしてください。
確認観点: 依頼内容（brief）を満たしているか、明らかな矛盾や欠落情報がないか、
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

function heuristicIssues(title: string, content: string): string[] {
  const issues: string[] = [];
  if (content.trim().length < 20) issues.push("本文が極端に短く、内容が不足しています。");
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content) || pattern.test(title)) {
      issues.push("プレースホルダーとみられる未完成の記述が残っています。");
      break;
    }
  }
  return issues;
}

export const createDocumentTool: ToolDefinition = {
  name: "create_document",
  description:
    "Draft and save a document (report, email, sns_post, slide outline, script, or note). Give it a brief " +
    "(what it needs to say / accomplish) rather than pre-written prose — drafting happens inside this tool, " +
    "at a model tier matched to how important the result is, then a self-check runs before saving. If the " +
    "check fails, this returns the issues instead of saving so you can revise the brief and call it again.",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: DOCUMENT_TYPES },
      title: { type: "string" },
      brief: {
        type: "string",
        description: "What this document needs to say/accomplish — the instructions to draft from, not finished prose.",
      },
      sourceMaterial: {
        type: "string",
        description: "Relevant facts/findings gathered so far (e.g. from web search) to ground the draft in.",
      },
      importance: {
        type: "string",
        enum: ["normal", "high"],
        description:
          "Your own assessment. 'high': this result matters a lot (e.g. it's being sent externally, or the " +
          "user called it important) and deserves stronger drafting/review. Defaults to 'normal'.",
      },
      destination: {
        type: "string",
        enum: ["local", "notion"],
        description:
          "'local' (default) saves only in FRIDAY's own database. 'notion' also publishes it as a page in " +
          "the connected Notion workspace — use this when the user wants something they can revisit/share/keep " +
          "updating, or explicitly asks for Notion. If Notion isn't connected, this falls back to 'local' and " +
          "says so in the result.",
      },
    },
    required: ["type", "title", "brief"],
  },
  level: 1,
  approval(input) {
    // Saving to FRIDAY's own database is private and undoable. Publishing a
    // page into a Notion workspace is neither, so that half of this tool is
    // the user's call to make, not the agent's.
    if (input.destination !== "notion") return null;
    return {
      level: 2,
      summary: `Notion に「${String(input.title ?? "").trim() || "(無題)"}」を公開する`,
    };
  },
  async execute(input, ctx) {
    const type = DOCUMENT_TYPES.includes(input.type as DocumentType) ? (input.type as DocumentType) : "other";
    const title = String(input.title ?? "").trim();
    const brief = String(input.brief ?? "").trim();
    const sourceMaterial = typeof input.sourceMaterial === "string" ? input.sourceMaterial.trim() : "";
    if (!title || !brief) return { ok: false, content: "title and brief are required" };

    // Zero extra LLM calls: the orchestrator judges importance as a tool
    // argument, so both drafting and review can use a stronger tier only
    // when it's actually warranted.
    const tier: ModelTier | undefined = input.importance === "high" ? "powerful" : undefined;

    const draftModel = routeModel("creation", tier);
    let content: string;
    try {
      const draftResult = await draftModel.provider.complete({
        model: draftModel.model,
        system: CREATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `type: ${type}\ntitle: ${title}\nbrief: ${brief}${
              sourceMaterial ? `\n\nsourceMaterial:\n${sourceMaterial}` : ""
            }`,
          },
        ],
        maxTokens: 4096,
      });
      ctx.costTracker.record(draftModel.model, draftResult.usage);
      content = draftResult.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
    } catch (err) {
      return { ok: false, content: `drafting failed: ${(err as Error).message}` };
    }
    if (!content) return { ok: false, content: "drafting produced no content" };

    const preChecks = heuristicIssues(title, content);
    if (preChecks.length) {
      return { ok: false, content: `Draft needs revision before it can be saved: ${preChecks.join("; ")}` };
    }

    const verifyModel = routeModel("verification", tier);
    let verification: VerificationOutput = { ok: true, issues: [] };
    try {
      const verifyResult = await verifyModel.provider.complete({
        model: verifyModel.model,
        system: VERIFICATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `brief: ${brief}\ntype: ${type}\ntitle: ${title}\n---\n${content}` }],
        maxTokens: 1024,
      });
      ctx.costTracker.record(verifyModel.model, verifyResult.usage);
      const text = verifyResult.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      verification = parseVerificationJson(text);
    } catch {
      // Verification is a quality gate, not a hard dependency — if it
      // errors, fail open rather than blocking the whole Creation turn.
    }

    if (!verification.ok) {
      return {
        ok: false,
        content: `Draft needs revision before it can be saved: ${verification.issues.join("; ")}`,
      };
    }

    const wantsNotion = input.destination === "notion";
    let storageRef: string | undefined;
    let notionNote = "";

    if (wantsNotion) {
      if (!isNotionConfigured()) {
        notionNote = " (Notion is not connected yet, saved locally instead — tell the user this.)";
      } else {
        try {
          const page = await createNotionPage(title, content);
          storageRef = page.url ?? undefined;
        } catch (err) {
          notionNote = ` (Notion publish failed, saved locally instead: ${(err as Error).message})`;
        }
      }
    }

    const [doc] = await db.insert(documents).values({ userId: ctx.userId, type, title, content, storageRef }).returning();

    const savedWhere = storageRef ? `Notion (${storageRef})` : "FRIDAY";
    return { ok: true, content: `Saved ${type} "${title}" to ${savedWhere} (document id ${doc.id}).${notionNote}` };
  },
};
