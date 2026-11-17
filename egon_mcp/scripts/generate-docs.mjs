// Regenerates skills/egon-mcp-skill/references/tools.md from the built server.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_REFERENCE_PATH, toolReferenceMarkdown } from '../dist/docs/tool-reference.js';
import { createEgonServer } from '../dist/server/server.js';

const root = mkdtempSync(join(tmpdir(), 'egon-docs-'));
let tools;
try {
  const egon = createEgonServer({ root });
  const client = new Client({ name: 'docs', version: '1.0.0' });
  try {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
    ({ tools } = await client.listTools());
  } finally {
    const closed = await Promise.allSettled([client.close(), egon.close()]);
    const failure = closed.find((result) => result.status === 'rejected');
    // Report a failed close, unless an earlier error is already on its way.
    if (tools && failure) {
      throw failure.reason;
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

mkdirSync(dirname(TOOL_REFERENCE_PATH), { recursive: true });
writeFileSync(TOOL_REFERENCE_PATH, toolReferenceMarkdown(tools));
console.log(`Wrote ${tools.length} tools to ${TOOL_REFERENCE_PATH}`);
