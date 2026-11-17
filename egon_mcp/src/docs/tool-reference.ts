import { fileURLToPath } from 'node:url';

/** Where the generated tool reference lives inside the agent skill. */
export const TOOL_REFERENCE_PATH = fileURLToPath(
  new URL('../../../skills/egon-mcp-skill/references/tools.md', import.meta.url),
);

interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
}

interface ToolLike {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
}

/** Renders the server's tools as Markdown for the skill's reference file. */
export function toolReferenceMarkdown(tools: ToolLike[]): string {
  const lines = [
    '# egon-mcp tool reference',
    '',
    'Generated from the server with `npm run docs` in `egon_mcp`. Do not edit by hand.',
    '',
    tools.map((tool) => `[${tool.name}](#${tool.name})`).join(' · '),
    '',
  ];
  for (const tool of tools) {
    lines.push(`## ${tool.name}`, '', tool.description ?? '', '');
    const properties = Object.entries(tool.inputSchema.properties ?? {});
    if (properties.length === 0) {
      lines.push('No parameters.', '');
      continue;
    }
    const required = new Set(tool.inputSchema.required ?? []);
    lines.push('| Parameter | Type | Required | Description |', '|---|---|---|---|');
    for (const [name, schema] of properties) {
      lines.push(`| \`${name}\` | ${typeOf(schema)} | ${required.has(name) ? 'yes' : 'no'} | ${cell(describe(schema))} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function typeOf(schema: JsonSchema): string {
  if (schema.enum) {
    return schema.enum.map((value) => `\`${String(value)}\``).join(' \\| ');
  }
  if (schema.anyOf) {
    const options = schema.anyOf.map(typeOf);
    return [...new Set(options)].join(' or ');
  }
  const type = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
  if (type === 'array') {
    return `array of ${schema.items ? typeOf(schema.items) : 'values'}`;
  }
  if (type === 'object' && schema.properties) {
    const fields = Object.keys(schema.properties).map((key) => (schema.required?.includes(key) ? key : `${key}?`));
    return `object {${fields.join(', ')}}`;
  }
  return type ?? 'any';
}

function describe(schema: JsonSchema): string {
  if (schema.description) {
    return schema.description;
  }
  return schema.anyOf?.find((option) => option.description)?.description ?? '';
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
