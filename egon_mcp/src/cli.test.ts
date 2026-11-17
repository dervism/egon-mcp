import { describe, expect, it } from 'vitest';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseOptions, realHome, rootWarning } from './cli.js';

describe('parseOptions', () => {
  it('defaults the workspace root to the current directory', () => {
    expect(parseOptions([], {}, '/work')).toEqual({ root: '/work' });
  });

  it('reads the root and Egon URL from flags', () => {
    expect(parseOptions(['--root', 'stories', '--egon-url', 'http://localhost:4200'], {}, '/work')).toEqual({
      root: '/work/stories',
      egonAppUrl: 'http://localhost:4200',
    });
    expect(parseOptions(['--root=/abs/dir'], {}, '/work')).toEqual({ root: '/abs/dir' });
  });

  it('falls back to environment variables', () => {
    expect(parseOptions([], { EGON_MCP_ROOT: '/env/root', EGON_APP_URL: 'https://egon.example/app/' }, '/work')).toEqual({
      root: '/env/root',
      egonAppUrl: 'https://egon.example/app/',
    });
  });

  it('prefers flags over environment variables', () => {
    expect(parseOptions(['--root', '/flag'], { EGON_MCP_ROOT: '/env' }, '/work').root).toBe('/flag');
  });

  it('selects the Egon file layout', () => {
    expect(parseOptions(['--egon-format', 'egon4'], {}, '/work').egonFormat).toBe('egon4');
    expect(parseOptions([], { EGON_FORMAT: 'egon3' }, '/work').egonFormat).toBe('egon3');
    expect(() => parseOptions(['--egon-format', 'egon5'], {}, '/work')).toThrow(/egon3 or egon4/);
  });

  it('answers --help and --version', () => {
    expect(parseOptions(['--help'], {}, '/work')).toEqual({ root: '/work', help: true });
    expect(parseOptions(['--version'], {}, '/work')).toEqual({ root: '/work', version: true });
  });

  it('rejects unknown flags and non-http Egon URLs', () => {
    expect(() => parseOptions(['--nope'], {}, '/work')).toThrow(/Unknown option/);
    expect(() => parseOptions(['--egon-url', 'javascript:alert(1)'], {}, '/work')).toThrow(/http/);
  });
});

describe('rootWarning', () => {
  it('warns when the workspace is the home directory', () => {
    expect(rootWarning('/Users/ann', '/Users/ann')).toMatch(/home directory/);
    expect(rootWarning('/Users/ann/stories', '/Users/ann')).toBeUndefined();
    expect(rootWarning('/Users', '/Users/ann')).toMatch(/home directory/);
  });

  it('says when the root is a folder above the home directory', () => {
    expect(rootWarning('/Users/ann', '/Users/ann')).toMatch(/is your home directory \(\/Users\/ann\)/);
    expect(rootWarning('/Users', '/Users/ann')).toMatch(/\(\/Users\) contains your home directory/);
    expect(rootWarning('/Users', '/Users/ann')).not.toMatch(/is your home directory/);
  });
});

describe('realHome', () => {
  it('resolves links in the home directory and keeps a missing one as given', () => {
    expect(realHome(() => '/nonexistent-egon-home')).toBe('/nonexistent-egon-home');
    expect(realHome(() => tmpdir())).toBe(realpathSync(tmpdir()));
  });

  it('returns nothing when the system knows no home directory', () => {
    expect(
      realHome(() => {
        throw new Error('no home directory');
      }),
    ).toBeUndefined();
    expect(rootWarning('/srv/stories', undefined)).toBeUndefined();
  });
});
