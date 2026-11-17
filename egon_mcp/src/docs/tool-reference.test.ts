import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listServerTools, TOOL_REFERENCE_PATH, toolReferenceMarkdown } from './tool-reference.js';

describe('toolReferenceMarkdown', () => {
  it('documents every tool with its description and parameters', async () => {
    const markdown = toolReferenceMarkdown(await listServerTools());
    expect(markdown).toContain('## add_activity');
    expect(markdown).toMatch(/\| `from` \| string \| yes \| Id of an element/);
    expect(markdown).toMatch(/\| `number` \| integer \| no \|/);
    expect(markdown).toContain('`format` | `egn` \\| `egn.svg` \\| `svg` \\| `markdown`');
    expect(markdown).toContain('## list_icons\n\nLists the names');
  });

  it('matches the reference in the skill; run "npm run docs" after changing tools', async () => {
    expect(existsSync(TOOL_REFERENCE_PATH)).toBe(true);
    expect(readFileSync(TOOL_REFERENCE_PATH, 'utf8')).toBe(toolReferenceMarkdown(await listServerTools()));
  });
});
