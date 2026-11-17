// Regenerates skills/egon-mcp-skill/references/tools.md from the built server.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_REFERENCE_PATH, toolReferenceMarkdown } from '../dist/docs/tool-reference.js';
import { createEgonServer } from '../dist/server/server.js';

const egon = createEgonServer({ root: mkdtempSync(join(tmpdir(), 'egon-docs-')) });
const client = new Client({ name: 'docs', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
const { tools } = await client.listTools();
await client.close();
await egon.close();

mkdirSync(dirname(TOOL_REFERENCE_PATH), { recursive: true });
writeFileSync(TOOL_REFERENCE_PATH, toolReferenceMarkdown(tools));
console.log(`Wrote ${tools.length} tools to ${TOOL_REFERENCE_PATH}`);
