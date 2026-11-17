import { afterEach, describe, expect, it } from 'vitest';
import { egonAppUrl, LinkServer } from './link-server.js';

let server: LinkServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('LinkServer', () => {
  it('serves a published story on loopback with the CORS headers Egon needs', async () => {
    server = new LinkServer();
    let version = 1;
    const url = await server.publish('order-pizza', 'Order pizza.egn', () => `{"v":${version}}`);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/s\/[0-9a-f]{32}\/Order%20pizza\.egn$/);

    const response = await fetch(url, { headers: { Origin: 'https://egon.io' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).toBe('{"v":1}');

    version = 2;
    expect(await (await fetch(url)).text()).toBe('{"v":2}');
  });

  it('answers preflight requests, including Private Network Access', async () => {
    server = new LinkServer();
    const url = await server.publish('s', 's.egn', () => '{}');
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: 'https://egon.io', 'Access-Control-Request-Private-Network': 'true' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
  });

  it('keeps the same link when a story is published again', async () => {
    server = new LinkServer();
    const first = await server.publish('s', 's.egn', () => '{}');
    const second = await server.publish('s', 's.egn', () => '{}');
    expect(second).toBe(first);
  });

  it('returns 404 for unknown links and removed stories', async () => {
    server = new LinkServer();
    const url = await server.publish('s', 's.egn', () => '{}');
    expect((await fetch(url.replace(/\/s\/[0-9a-f]+\//, '/s/0000/'))).status).toBe(404);
    server.unpublish('s');
    expect((await fetch(url)).status).toBe(404);
  });

  it('only accepts GET, HEAD and OPTIONS', async () => {
    server = new LinkServer();
    const url = await server.publish('s', 's.egn', () => '{}');
    expect((await fetch(url, { method: 'POST', body: 'x' })).status).toBe(405);
  });
});

describe('egonAppUrl', () => {
  it('builds the storyUrl link for the Egon app', () => {
    expect(egonAppUrl('http://127.0.0.1:5000/s/abc/My%20story.egn')).toBe(
      'https://egon.io/app/?storyUrl=http%3A%2F%2F127.0.0.1%3A5000%2Fs%2Fabc%2FMy%2520story.egn',
    );
    expect(egonAppUrl('http://x/s.egn', { startReplay: true, appUrl: 'http://localhost:4200' })).toBe(
      'http://localhost:4200/?storyUrl=http%3A%2F%2Fx%2Fs.egn&startReplay=true',
    );
  });
});
