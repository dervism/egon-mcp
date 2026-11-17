import { describe, expect, it } from 'vitest';
import { parseOptions } from './cli.js';

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

  it('answers --help and --version', () => {
    expect(parseOptions(['--help'], {}, '/work')).toEqual({ root: '/work', help: true });
    expect(parseOptions(['--version'], {}, '/work')).toEqual({ root: '/work', version: true });
  });

  it('rejects unknown flags and non-http Egon URLs', () => {
    expect(() => parseOptions(['--nope'], {}, '/work')).toThrow(/Unknown option/);
    expect(() => parseOptions(['--egon-url', 'javascript:alert(1)'], {}, '/work')).toThrow(/http/);
  });
});
