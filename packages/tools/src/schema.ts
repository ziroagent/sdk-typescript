import type { ToolDefinitionForModel } from '@ziroagent/core';
import { z } from 'zod';
import type { Tool } from './define-tool.js';

/**
 * Convert a Ziro `Tool` into the provider-agnostic shape consumed by
 * `LanguageModel.generate({ tools })`. Uses Zod v4's built-in JSON Schema
 * exporter so we never lose track of which schema was sent to the model.
 */
export function toolToModelDefinition(tool: Tool): ToolDefinitionForModel {
  const parameters = z.toJSONSchema(tool.input, { target: 'draft-7' });
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    parameters: parameters as Record<string, unknown>,
  };
}

export function toolsToModelDefinitions(
  tools: Record<string, Tool> | Tool[],
): ToolDefinitionForModel[] {
  const list = Array.isArray(tools) ? tools : Object.values(tools);
  return list.map(toolToModelDefinition);
}
