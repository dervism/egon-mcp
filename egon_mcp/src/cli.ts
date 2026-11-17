import { resolve } from 'node:path';

export interface CliOptions {
  root: string;
  egonAppUrl?: string;
  help?: boolean;
  version?: boolean;
}

export const USAGE = `Usage: egon-mcp [--root <dir>] [--egon-url <url>]

Starts the Egon.io MCP server on stdio.

  --root <dir>      Directory the server may read and write story files in.
                    Default: $EGON_MCP_ROOT, else the current directory.
  --egon-url <url>  Egon app used by open_in_egon.
                    Default: $EGON_APP_URL, else https://egon.io/app/
  --help            Show this help.
  --version         Show the version.`;

/** Reads command line flags, then environment variables. */
export function parseOptions(argv: string[], env: Record<string, string | undefined>, cwd: string): CliOptions {
  let root = env['EGON_MCP_ROOT'];
  let egonAppUrl = env['EGON_APP_URL'];
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
  return {
    root: resolve(cwd, root ?? '.'),
    ...(egonAppUrl ? { egonAppUrl } : {}),
    ...flags,
  };
}
