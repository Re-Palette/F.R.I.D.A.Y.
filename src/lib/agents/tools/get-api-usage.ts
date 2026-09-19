import { describeUsage, getUsageSummary } from "../usage";
import type { ToolDefinition } from "./types";

export const getApiUsageTool: ToolDefinition = {
  name: "get_api_usage",
  description:
    "Read this app's own Claude API consumption — cost, request count and tokens for today and this month, " +
    "broken down by model. Use whenever the user asks what F.R.I.D.A.Y. is costing, how much API usage there " +
    "has been, or which model is spending the most. Never estimate these numbers; they are recorded per run. " +
    "This covers only what this app spent — not Claude Code, the Console, or anything else on the same key.",
  inputSchema: { type: "object", properties: {} },
  level: 1,
  async execute() {
    try {
      const summary = await getUsageSummary();
      const models = summary.byModel
        .map((m) => `  ${m.model}: $${m.costUsd.toFixed(4)}, ${m.calls} calls, ${m.tokens} tokens`)
        .join("\n");

      return {
        ok: true,
        content:
          `This month: $${summary.month.costUsd.toFixed(4)}, ${summary.month.calls} API calls, ` +
          `${summary.month.tokens} tokens, across ${summary.month.runs} agent runs.\n` +
          `Today: $${summary.today.costUsd.toFixed(4)}, ${summary.today.calls} API calls, ` +
          `${summary.today.tokens} tokens, across ${summary.today.runs} agent runs.\n` +
          (models ? `By model (this month):\n${models}\n` : "") +
          `Spoken summary: ${describeUsage(summary)}`,
      };
    } catch (err) {
      return { ok: false, content: `Usage lookup failed: ${(err as Error).message}` };
    }
  },
};
