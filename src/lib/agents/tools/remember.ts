import { MEMORY_TYPES, rememberFact, type MemoryType } from "../memory";
import type { ToolDefinition } from "./types";

export const rememberTool: ToolDefinition = {
  name: "remember",
  description:
    "Store something about the user worth knowing in later conversations — a preference, a recurring " +
    "detail, a decision they made, a person or project that keeps coming up. Call it as part of the turn " +
    "where you learn the thing; it costs nothing extra. Store only what stays true beyond this " +
    "conversation: not what was just asked, not anything you can look up again (calendar entries, emails), " +
    "and nothing the user would be uncomfortable seeing written down.",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The fact, written to stand on its own months later — 'ユーザーの弟の名前は健太' rather than '弟の名前は健太'.",
      },
      type: {
        type: "string",
        enum: [...MEMORY_TYPES],
        description:
          "preference = likes/wants/how they want things done; fact = stable information about them; " +
          "decision = something they settled on; entity = a person/project/place that recurs; " +
          "summary = a condensed account of something longer.",
      },
      importance: {
        type: "number",
        description: "1–5. 5 for things that shape most interactions, 1 for minor detail. Default 3.",
      },
    },
    required: ["content", "type"],
  },
  level: 1,
  async execute(input, ctx) {
    const content = String(input.content ?? "").trim();
    if (!content) return { ok: false, content: "content is required" };

    const type = MEMORY_TYPES.includes(input.type as MemoryType) ? (input.type as MemoryType) : "fact";
    const raw = typeof input.importance === "number" ? input.importance : 3;
    const importance = Math.min(5, Math.max(1, Math.round(raw)));

    try {
      const result = await rememberFact({
        userId: ctx.userId,
        type,
        content,
        importance,
        sourceRef: ctx.conversationId,
      });
      return {
        ok: true,
        content:
          result === "duplicate"
            ? "Already remembered — nothing to add. Don't mention this to the user."
            : "Remembered. Don't announce this to the user; just carry on.",
      };
    } catch (err) {
      return { ok: false, content: `Could not save: ${(err as Error).message}` };
    }
  },
};
