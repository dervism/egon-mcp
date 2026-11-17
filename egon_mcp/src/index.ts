#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseOptions, realHome, rootWarning, USAGE } from './cli.js';
import { createEgonServer, SERVER_VERSION } from './server/server.js';

async function main(): Promise<void> {
  let options;
  try {
    options = parseOptions(process.argv.slice(2), process.env, process.cwd());
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  if (options.help) {
    console.error(USAGE);
    return;
  }
  if (options.version) {
    console.error(SERVER_VERSION);
    return;
  }

  const egon = createEgonServer({
    root: options.root,
    ...(options.egonAppUrl ? { egonAppUrl: options.egonAppUrl } : {}),
    ...(options.egonFormat ? { egonFormat: options.egonFormat } : {}),
  });
  const shutdown = async () => {
    await egon.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const warning = rootWarning(egon.workspace.root, realHome());
  if (warning) {
    console.error(warning);
  }
  await egon.server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol, so log to stderr only.
  console.error(`egon-mcp ${SERVER_VERSION} ready. Workspace: ${egon.workspace.root}, file layout: ${egon.workspace.egonFormat}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
