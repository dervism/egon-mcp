import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createEgonServer } from '../server/server.js';
import { TOOL_REFERENCE_PATH, toolReferenceMarkdown } from './tool-reference.js';

async function currentTools() {
  const egon = createEgonServer({ root: mkdtempSync(join(tmpdir(), 'egon-docs-')) });
  const client = new Client({ name: 'docs', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  await egon.close();
  return tools;
}

describe('toolReferenceMarkdown', () => {
  it('documents every tool with its description and parameters', async () => {
    const markdown = toolReferenceMarkdown(await currentTools());
    expect(markdown).toContain('## add_activity');
    expect(markdown).toMatch(/\| `from` \| string \| yes \| Id of an element/);
    expect(markdown).toMatch(/\| `number` \| integer \| no \|/);
    expect(markdown).toContain('`format` | `egn` \\| `egn.svg` \\| `svg` \\| `markdown`');
    expect(markdown).toContain('## list_icons\n\nLists the names');
  });

  it('matches the reference in the skill; run "npm run docs" after changing tools', async () => {
    expect(existsSync(TOOL_REFERENCE_PATH)).toBe(true);
    expect(readFileSync(TOOL_REFERENCE_PATH, 'utf8')).toBe(toolReferenceMarkdown(await currentTools()));
  });
});
