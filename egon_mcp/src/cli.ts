import { resolve } from 'node:path';
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
