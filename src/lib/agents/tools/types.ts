export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
}

export interface ToolResult {
  /** Whether the tool succeeded — false feeds an is_error tool_result back to the model. */
  ok: boolean;
  /** Text fed back to the model as the tool_result content. */
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Approval level per Master Brief §12. All current tools are Level 1 (auto). */
  level: 1 | 2 | 3;
  execute: (input: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolResult>;
}
