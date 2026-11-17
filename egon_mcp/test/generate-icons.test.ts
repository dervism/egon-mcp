import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'egon-generate-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Runs the icon generator on an Egon source text, writing into the temp folder. */
function generate(source: string | undefined) {
  const sourceFile = join(dir, 'builtInIcons.ts');
  if (source !== undefined) {
    writeFileSync(sourceFile, source);
  }
  const out = join(dir, 'builtin-icons.json');
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', 'scripts/generate-icons.mjs', sourceFile, out],
    { cwd: packageDir, encoding: 'utf8', timeout: 20_000 },
  );
  return { ...result, out };
}

describe('scripts/generate-icons.mjs', () => {
  it('writes the icons it finds in Egon\'s source', () => {
    const result = generate("const icons = new Dictionary();\nicons.putEntry(new Entry('<svg/>', 'Person', ['human']));\n");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Wrote 1 built-in icons');
    expect(JSON.parse(readFileSync(result.out, 'utf8'))).toEqual([{ svg: '<svg/>', name: 'Person', keywords: ['human'] }]);
  });

  it('fails with one line, and writes nothing, when Egon\'s source does not have the expected shape', () => {
    const result = generate("const icons = new Dictionary();\nicons.putEntry(new Entry('<svg/>', '', ['x']));\n");
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toMatch(/its format may have changed/);
    expect(existsSync(result.out)).toBe(false);
  });

  it('runs the build\'s own check before writing, for what extraction lets through', () => {
    // A keyword list with a hole passes extraction but not the build's check.
    const result = generate("const icons = new Dictionary();\nicons.putEntry(new Entry('<svg/>', 'Person', ['a', , 'b']));\n");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/do not have the shape the server reads/);
    expect(existsSync(result.out)).toBe(false);
  });

  it('takes both paths or none, so a stray argument cannot overwrite the real icon file', () => {
    for (const args of [['only-source.ts'], ['--help'], ['a.ts', 'b.json', 'c']]) {
      const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/generate-icons.mjs', ...args], {
        cwd: packageDir,
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr).toMatch(/Usage: node scripts\/generate-icons\.mjs \[<egon source file> <output file>\]/);
    }
  });

  it('says how to get Egon\'s source when it is missing', () => {
    const result = generate(undefined);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Cannot find .*builtInIcons\.ts/);
  });
});
