import type { CostTracker } from "../cost-tracker";

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  /** Shared across the whole Agent Run so nested LLM calls count toward its total cost. */
  costTracker: CostTracker;
}

export interface ToolResult {
  /** Whether the tool succeeded — false feeds an is_error tool_result back to the model. */
  ok: boolean;
  /** Text fed back to the model as the tool_result content. */
  content: string;
}

export interface ApprovalRequest {
  /** Master Brief §12: 2 = confirm before acting, 3 = explicit instruction required. */
  level: 2 | 3;
  /** What the user reads when deciding — the action in plain language. */
  summary: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Approval level per Master Brief §12 — the tool's floor, before input is considered. */
  level: 1 | 2 | 3;
  /**
   * Whether *this particular call* needs a human first. Judged per input
   * rather than per tool, because the same tool can be harmless or
   * consequential depending on what it was asked to do — saving a draft
   * locally versus publishing it where other people can see it. Omitted, or
   * returning null, means the call runs automatically.
   */
  approval?: (input: Record<string, unknown>) => ApprovalRequest | null;
  execute: (input: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolResult>;
}
