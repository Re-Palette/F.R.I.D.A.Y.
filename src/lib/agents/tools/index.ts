import type { LLMToolDef } from "@/lib/llm/types";
import { createPlanTool } from "./create-plan";
import { createDocumentTool } from "./create-document";
import { getApiUsageTool } from "./get-api-usage";
import { getCalendarEventsTool } from "./get-calendar-events";
import { createEmailDraftTool, readEmailTool, searchEmailTool, sendEmailTool } from "./email";
import { readDriveFileTool, searchDriveTool } from "./drive";
import { githubTool } from "./github";
import { rememberTool } from "./remember";
import { scheduledTasksTool } from "./scheduled-tasks";
import type { ToolDefinition } from "./types";

export const TOOLS: ToolDefinition[] = [
  createPlanTool,
  createDocumentTool,
  getCalendarEventsTool,
  getApiUsageTool,
  searchEmailTool,
  readEmailTool,
  createEmailDraftTool,
  sendEmailTool,
  searchDriveTool,
  readDriveFileTool,
  githubTool,
  rememberTool,
  scheduledTasksTool,
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toLLMToolDefs(): LLMToolDef[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

export type { ToolDefinition, ToolExecutionContext, ToolResult } from "./types";
