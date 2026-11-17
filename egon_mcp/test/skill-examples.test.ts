import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEgonServer, type EgonServer } from '../src/server/server.js';

const skillDir = new URL('../../skills/egon-mcp-skill/', import.meta.url);
const examples = readFileSync(new URL('references/examples.md', skillDir), 'utf8');
const skill = readFileSync(new URL('SKILL.md', skillDir), 'utf8');

let root: string;
let egon: EgonServer;
let client: Client;
let toolNames: string[];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'egon-skill-'));
  egon = createEgonServer({ root });
  client = new Client({ name: 'skill', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
  toolNames = (await client.listTools()).tools.map((tool) => tool.name);
});

afterAll(async () => {
  try {
    await client?.close();
    await egon?.close();
  } finally {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] as string);
}

describe('egon-mcp-skill', () => {
  it('has the frontmatter Claude needs to load it', () => {
    expect(skill).toMatch(/^---\nname: egon-mcp-skill\ndescription: .{50,}\n---\n/);
  });

  it('only mentions tools that the server offers', () => {
    const files = [skill, examples, readFileSync(new URL('references/domain-storytelling.md', skillDir), 'utf8')];
    const mentioned = new Set(files.flatMap((text) => [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1] as string)));
    const notTools = new Set(['egon_mcp', 'list_story', 'pointInTime']);
    for (const name of mentioned) {
      if (!notTools.has(name) && !name.includes('domain_story_interview') && !name.includes('review_domain_story')) {
        expect(toolNames, `skill mentions ${name}`).toContain(name);
      }
    }
  });

  it('runs the build_story example without validation errors', async () => {
    const args = JSON.parse(jsonBlocks(examples)[0] as string);
    const result = (await client.callTool({ name: 'build_story', arguments: args })) as unknown as {
      isError?: boolean;
      structuredContent: { storyId: string; issues: { severity: string }[]; narrative: string };
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.storyId).toBe('order-pizza-by-phone');
    expect(result.structuredContent.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.structuredContent.narrative).toContain(
      [
        '1. Customer orders Pizza order from Clerk.',
        '2. Clerk writes Order slip.',
        '3. Clerk hands Order slip to Pizza baker.',
        '4. Pizza baker bakes Pizza.',
        '5. Clerk gives Pizza to Customer.',
        '6. Customer pays Money to Clerk.',
      ].join('\n'),
    );
  });

  it('runs the interview example call by call', async () => {
    const block = jsonBlocks(examples).find((text) => text.includes('"rent-a-car"')) as string;
    for (const line of block.trim().split('\n')) {
      const { tool, arguments: args } = JSON.parse(line);
      const result = (await client.callTool({ name: tool, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      expect(result.isError, `${tool}: ${result.content[0]?.text}`).toBeFalsy();
    }
  });

  it('explains only error messages the server can produce', () => {
    const section = skill.slice(skill.indexOf('## When something fails'), skill.indexOf('## References'));
    const rows = section.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Message contains'));
    expect(rows.length).toBeGreaterThan(5);
    const keys = rows.flatMap((row) => {
      const found = [...(row.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
      expect(found.length, `row without a message key: ${row}`).toBeGreaterThan(0);
      return found;
    });
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    // Comments do not count: only text the server can actually send.
    const sources = (readdirSync(srcDir, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) =>
        readFileSync(join(srcDir, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[ \t])\/\/.*$/gm, '$1'),
      )
      .join('\n');
    for (const key of keys) {
      expect(sources.includes(key), `no server message contains "${key}"`).toBe(true);
    }
  });
});
