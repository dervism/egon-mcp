import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import type { EgonFormat } from './egon/serialize.js';

export interface CliOptions {
  root: string;
  egonAppUrl?: string;
  egonFormat?: EgonFormat;
  help?: boolean;
  version?: boolean;
}

export const USAGE = `Usage: egon-mcp [--root <dir>] [--egon-url <url>] [--egon-format egon3|egon4]

Starts the Egon.io MCP server on stdio.

  --root <dir>      Directory the server may read and write story files in.
                    Default: $EGON_MCP_ROOT, else the current directory.
                    The file system root (/) is refused.
  --egon-url <url>  Egon app used by open_in_egon.
                    Default: $EGON_APP_URL, else https://egon.io/app/
  --egon-format     Layout of written .egn files: egon3 (works with egon.io 3.x
                    and Egon 4) or egon4 (keeps title and scope in the file).
                    Default: $EGON_FORMAT, else egon3.
  --help            Show this help.
  --version         Show the version.`;

/** Reads command line flags, then environment variables. */
export function parseOptions(argv: string[], env: Record<string, string | undefined>, cwd: string): CliOptions {
  let root = env['EGON_MCP_ROOT'];
  let egonAppUrl = env['EGON_APP_URL'];
  let egonFormat = env['EGON_FORMAT'];
  const flags: Partial<CliOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    const [name, inline] = arg.includes('=') ? (arg.split(/=(.*)/s, 2) as [string, string]) : [arg, undefined];
    const value = () => {
      const next = inline ?? argv[++index];
      if (next === undefined) {
        throw new Error(`${name} needs a value.`);
      }
      return next;
    };
    switch (name) {
      case '--root':
        root = value();
        break;
      case '--egon-url':
        egonAppUrl = value();
        break;
      case '--egon-format':
        egonFormat = value();
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      case '--version':
      case '-v':
        flags.version = true;
        break;
      default:
        throw new Error(`Unknown option ${arg}.\n\n${USAGE}`);
    }
  }

  // Help and version answer without checking the other flags or the environment.
  if (flags.help || flags.version) {
    return { root: resolve(cwd, root ?? '.'), ...flags };
  }
  if (egonAppUrl !== undefined && !/^https?:\/\//i.test(egonAppUrl)) {
    throw new Error(`The Egon URL must start with http:// or https://, got "${egonAppUrl}".`);
  }
  if (egonFormat !== undefined && egonFormat !== 'egon3' && egonFormat !== 'egon4') {
    throw new Error(`The Egon format must be egon3 or egon4, got "${egonFormat}".`);
  }
  return {
    root: resolve(cwd, root ?? '.'),
    ...(egonAppUrl ? { egonAppUrl } : {}),
    ...(egonFormat ? { egonFormat } : {}),
    ...flags,
  };
}

/** A warning for roots that give the server more reach than intended (the home directory or above it). */
export function rootWarning(root: string, home: string | undefined): string | undefined {
  if (home === undefined) {
    return undefined;
  }
  const rootWithSeparator = root.endsWith(sep) ? root : root + sep;
  const advice = 'Consider --root <dir> for a stories folder.';
  if (root === home) {
    return `Warning: the workspace root is your home directory (${root}). ${advice}`;
  }
  if (home.startsWith(rootWithSeparator)) {
    return `Warning: the workspace root (${root}) contains your home directory. ${advice}`;
  }
  return undefined;
}

/**
 * The home directory with links resolved, as given when it does not exist,
 * or undefined when the system has none (service accounts, containers).
 */
export function realHome(home: () => string = homedir): string | undefined {
  let path: string;
  try {
    path = home();
  } catch {
    return undefined;
  }
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
