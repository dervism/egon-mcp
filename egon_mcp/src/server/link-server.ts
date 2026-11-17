import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const DEFAULT_EGON_APP_URL = 'https://egon.io/app/';

interface Published {
  token: string;
  fileName: string;
  content: () => string;
}

/**
 * A tiny HTTP server on 127.0.0.1 that serves open stories as `.egn` files,
 * so the Egon app can load them through its `?storyUrl=` parameter (see
 * docs/adr/0008-open-in-egon-through-local-link-server.md). Links contain a
 * random token and always serve the current state of the story.
 */
export class LinkServer {
  private server: Server | undefined;
  private starting: Promise<void> | undefined;
  private port: number | undefined;
  private readonly byStory = new Map<string, Published>();
  private readonly byToken = new Map<string, Published>();

  constructor(private readonly host = '127.0.0.1') {}

  /** Makes a story available and returns its URL. Publishing again keeps the link. */
  async publish(storyId: string, fileName: string, content: () => string): Promise<string> {
    await this.start();
    let entry = this.byStory.get(storyId);
    if (entry) {
      this.byToken.delete(entry.token);
    }
    entry = { token: entry?.token ?? randomBytes(16).toString('hex'), fileName, content };
    this.byStory.set(storyId, entry);
    this.byToken.set(entry.token, entry);
    return `http://${this.host}:${this.port}/s/${entry.token}/${urlFileName(fileName)}`;
  }

  unpublish(storyId: string): void {
    const entry = this.byStory.get(storyId);
    if (entry) {
      this.byStory.delete(storyId);
      this.byToken.delete(entry.token);
    }
  }

  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const server = this.server;
    this.server = undefined;
    this.starting = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private start(): Promise<void> {
    this.starting ??= this.listen().catch((error: unknown) => {
      // Let the next call try again instead of caching the failure.
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  protected async listen(): Promise<void> {
    const server = createServer((request, response) => this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, this.host, () => resolve());
    });
    // Do not keep the MCP process alive just for this server.
    server.unref();
    this.server = server;
    this.port = (server.address() as AddressInfo).port;
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      response.setHeader('Access-Control-Allow-Headers', '*');
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }).end();
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
      return;
    }
    const match = /^\/s\/([0-9a-f]{32})\/[^/]+$/.exec(pathname);
    const entry = match ? this.byToken.get(match[1] as string) : undefined;
    if (!entry) {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    let body: string;
    try {
      body = entry.content();
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain' }).end((error as Error).message);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : body);
  }
}

/**
 * The last URL segment, which Egon 3 turns into the story title by replacing
 * "%20" with spaces and nothing else. Spaces are encoded, characters that
 * would end or change the URL path are dropped, and other characters stay as
 * they are so that titles like "für" survive (fetch encodes them on the wire).
 */
function urlFileName(fileName: string): string {
  return fileName
    .replace(/[#?%&+/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ (?=\.egn$)/, '')
    .trim()
    .replace(/ /g, '%20');
}

/** The Egon app URL that loads `storyUrl` on start, optionally starting the replay. */
export function egonAppUrl(storyUrl: string, options: { startReplay?: boolean; appUrl?: string } = {}): string {
  const base = (options.appUrl ?? DEFAULT_EGON_APP_URL).replace(/\/?$/, '/');
  const replay = options.startReplay ? '&startReplay=true' : '';
  return `${base}?storyUrl=${encodeURIComponent(storyUrl)}${replay}`;
}
