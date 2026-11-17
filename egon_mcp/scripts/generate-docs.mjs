// Regenerates skills/egon-mcp-skill/references/tools.md from the built server.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { listServerTools, TOOL_REFERENCE_PATH, toolReferenceMarkdown } from '../dist/docs/tool-reference.js';

const tools = await listServerTools();
mkdirSync(dirname(TOOL_REFERENCE_PATH), { recursive: true });
writeFileSync(TOOL_REFERENCE_PATH, toolReferenceMarkdown(tools));
console.log(`Wrote ${tools.length} tools to ${TOOL_REFERENCE_PATH}`);
