import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sourceFiles } from '../src/build-info.js';
import { createEgonServer, type EgonServer } from '../src/server/server.js';
import { closeAll } from './close-all.js';

const skillDir = new URL('../../skills/egon-mcp-skill/', import.meta.url);
const examples = readFileSync(new URL('references/examples.md', skillDir), 'utf8');
const skill = readFileSync(new URL('SKILL.md', skillDir), 'utf8');

let root: string;
let egon: EgonServer;
let client: Client;
let toolNames: string[];
let promptNames: string[];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'egon-skill-'));
  egon = createEgonServer({ root });
  client = new Client({ name: 'skill', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
  toolNames = (await client.listTools()).tools.map((tool) => tool.name);
  promptNames = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
});

afterAll(async () => {
  try {
    await closeAll(client, egon);
  } finally {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

/** SKILL.md and every reference file. */
function skillFiles(): string[] {
  const references = fileURLToPath(new URL('references/', skillDir));
  return [fileURLToPath(new URL('SKILL.md', skillDir)), ...readdirSync(references).filter((name) => name.endsWith('.md')).map((name) => join(references, name))];
}

interface ExampleBlock {
  heading: string;
  kind: 'build_story' | 'calls';
  json: string;
  /** The numbered sentences of a ```text block right after the example. */
  expected?: string[];
}

/** Each ```json block of the examples file, with the ```text narrative that follows it, if any. */
function exampleBlocks(markdown: string): ExampleBlock[] {
  const blocks: ExampleBlock[] = [];
  let heading = '';
  for (const match of markdown.matchAll(/^(#{2,3} .*)$|```(json|text)\n([\s\S]*?)```/gm)) {
    if (match[1]) {
      heading = match[1];
    } else if (match[2] === 'json') {
      const json = match[3] as string;
      blocks.push({ heading, json, kind: json.trimStart().startsWith('{ "tool"') || json.includes('\n{ "tool"') ? 'calls' : 'build_story' });
    } else if (match[2] === 'text' && blocks.length > 0 && !blocks[blocks.length - 1]?.expected) {
      blocks[blocks.length - 1]!.expected = (match[3] as string).trim().split('\n');
    }
  }
  return blocks;
}

/** The sentences of a snippet: one JSON object, or one object per line. */
function snippetSentences(json: string): unknown[] {
  try {
    return [JSON.parse(json)];
  } catch {
    return json
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  }
}

type Call = (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Runs one example against a fresh server whose workspace holds the stories in
 * the repository's examples folder, then checks the narrative it shows and that
 * the story has no validation errors and no warnings other than unlabeled
 * arrows, which the message-flow variant uses on purpose.
 */
async function runExample(block: ExampleBlock, check?: (call: Call, storyId: string) => Promise<void>): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'egon-skill-'));
  cpSync(fileURLToPath(new URL('../../examples/', import.meta.url)), workspace, { recursive: true });
  const server = createEgonServer({ root: workspace });
  const exampleClient = new Client({ name: 'skill-example', version: '1.0.0' });
  try {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.server.connect(serverTransport), exampleClient.connect(clientTransport)]);
    const call: Call = async (tool, args) => {
      const result = (await exampleClient.callTool({ name: tool, arguments: args })) as {
        isError?: boolean;
        content: { text: string }[];
        structuredContent?: Record<string, unknown>;
      };
      expect(result.isError, `${block.heading}: ${tool} failed: ${result.content[0]?.text}`).toBeFalsy();
      return { ...result.structuredContent, text: result.content[0]?.text };
    };
    let storyId: string | undefined;
    if (block.kind === 'build_story') {
      storyId = (await call('build_story', JSON.parse(block.json))).storyId as string;
    } else {
      for (const line of block.json.trim().split('\n')) {
        const { tool, arguments: args } = JSON.parse(line) as { tool: string; arguments: Record<string, unknown> };
        const result = await call(tool, args);
        storyId = (result.storyId as string | undefined) ?? (args.storyId as string | undefined) ?? storyId;
      }
    }
    expect(storyId, `${block.heading}: no story`).toBeTruthy();
    const issues = (await call('validate_story', { storyId })).issues as { severity: string; code: string; message: string }[];
    expect(issues.filter((issue) => issue.code !== 'unlabeled-activity'), block.heading).toEqual([]);
    if (block.expected) {
      const steps = (await call('narrate_story', { storyId })).steps as { number: number; sentence: string }[];
      expect(steps.map((step) => `${step.number}. ${step.sentence}`), block.heading).toEqual(block.expected);
    }
    await check?.(call, storyId as string);
  } finally {
    await closeAll(exampleClient, server);
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe('egon-mcp-skill', () => {
  it('has the frontmatter Claude needs to load it', () => {
    expect(skill).toMatch(/^---\nname: egon-mcp-skill\ndescription: .{50,}\n---\n/);
  });

  it('only mentions tools and prompts that the server offers', () => {
    const files = skillFiles().map((file) => readFileSync(file, 'utf8'));
    const mentioned = new Set(files.flatMap((text) => [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1] as string)));
    const notTools = new Set(['egon_mcp', 'list_story', 'pointInTime']);
    for (const name of mentioned) {
      if (!notTools.has(name)) {
        expect([...toolNames, ...promptNames], `skill mentions ${name}`).toContain(name);
      }
    }
  });

  it('runs every example in references/examples.md and gets the narratives it shows', async () => {
    const blocks = exampleBlocks(examples);
    expect(blocks.filter((block) => block.kind === 'build_story').length, 'build_story examples').toBeGreaterThanOrEqual(8);
    expect(blocks.filter((block) => block.expected).length, 'examples that show their narrative').toBeGreaterThanOrEqual(8);
    for (const block of blocks) {
      await runExample(block);
    }
  }, 60_000);

  it('colors exactly what the examples say they color', async () => {
    const colored = async (heading: string, color: string) => {
      const block = exampleBlocks(examples).find((candidate) => candidate.heading.startsWith(heading));
      expect(block, heading).toBeDefined();
      let names: string[] = [];
      await runExample(block!, async (call, storyId) => {
        const story = (await call('export_story', { storyId, format: 'egn' })).text as string;
        const elements = (JSON.parse(story).dst as { name?: string; pickedColor?: string }[]).filter((element) => element.pickedColor === color);
        names = elements.map((element) => element.name ?? '').sort();
      });
      return names;
    };
    expect(await colored('## 4.', '#2E7D32')).toEqual(['Text message', 'Workshop app', 'new']);
    expect(await colored('## 10.', '#C62828')).toEqual(['Part prices']);
  });

  it('builds the sentence snippets in SKILL.md and references/modeling-patterns.md as written', async () => {
    const patterns = readFileSync(new URL('references/modeling-patterns.md', skillDir), 'utf8');
    const snippets = [...exampleBlocks(skill), ...exampleBlocks(patterns)];
    expect(snippets.length).toBeGreaterThanOrEqual(7);
    for (const snippet of snippets) {
      const sentences = snippetSentences(snippet.json);
      await runExample({ ...snippet, kind: 'build_story', json: JSON.stringify({ title: 'Pattern', sentences }) });
    }
  }, 60_000);

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
    const sources = sourceFiles(srcDir)
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
