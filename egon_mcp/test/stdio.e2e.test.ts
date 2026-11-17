import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

// Runs against the build output; `npm run build` first.
describe.skipIf(!existsSync(entry))('egon-mcp over stdio', () => {
  it('starts, builds a story and saves it into the workspace root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'egon-e2e-'));
    const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--root', root], stderr: 'pipe' });
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()?.name).toBe('egon-mcp');
      expect(client.getInstructions()).toContain('build_story');

      const built = (await client.callTool({
        name: 'build_story',
        arguments: {
          title: 'Return a parcel',
          sentences: [
            { actor: 'Customer', activity: 'brings', workObject: 'Parcel', to: [{ activity: 'to', actor: 'Post office clerk' }] },
            { actor: 'Post office clerk', activity: 'scans', workObject: 'Label' },
          ],
        },
      })) as { structuredContent: { storyId: string } };
      const saved = (await client.callTool({
        name: 'save_story',
        arguments: { storyId: built.structuredContent.storyId },
      })) as { structuredContent: { path: string } };

      const file = JSON.parse(readFileSync(join(root, saved.structuredContent.path), 'utf8'));
      expect(file.domainStory.title).toBe('Return a parcel');
      expect(file.domainStory.businessObjects.length).toBe(7);
    } finally {
      await client.close();
    }
  }, 20_000);
});
