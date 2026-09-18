import type { LLMToolDef } from "@/lib/llm/types";
import { createPlanTool } from "./create-plan";
import { createDocumentTool } from "./create-document";
import { getCalendarEventsTool } from "./get-calendar-events";
import { createEmailDraftTool, readEmailTool, searchEmailTool, sendEmailTool } from "./email";
import type { ToolDefinition } from "./types";

export const TOOLS: ToolDefinition[] = [
  createPlanTool,
  createDocumentTool,
  getCalendarEventsTool,
  searchEmailTool,
  readEmailTool,
  createEmailDraftTool,
  sendEmailTool,
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toLLMToolDefs(): LLMToolDef[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

export type { ToolDefinition, ToolExecutionContext, ToolResult } from "./types";
