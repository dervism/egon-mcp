import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(repoRoot + path, 'utf8');

describe('license', () => {
  it('ships the GPL version 3 text at the repository root', () => {
    const text = read('LICENSE');
    expect(text.startsWith('                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n')).toBe(true);
    expect(text).toContain('END OF TERMS AND CONDITIONS');
  });

  it('declares GPL-3.0-or-later, the terms Egon uses, in package.json and the lock file', () => {
    const pkg = JSON.parse(read('egon_mcp/package.json')) as { license?: string };
    const lock = JSON.parse(read('egon_mcp/package-lock.json')) as { packages: Record<string, { license?: string }> };
    expect(pkg.license).toBe('GPL-3.0-or-later');
    expect(lock.packages['']?.license).toBe('GPL-3.0-or-later');
  });

  it('states the license in the README', () => {
    const readme = read('README.md');
    const section = readme.slice(readme.indexOf('## License'));
    expect(section).toContain('GPL-3.0-or-later');
    expect(section).toContain('[LICENSE](LICENSE)');
    expect(section).not.toContain('No license has been chosen');
  });
});
