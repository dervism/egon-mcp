import { describe, expect, it } from 'vitest';
import { closeAll } from './close-all.js';

describe('closeAll', () => {
  it('closes everything even when a close throws or rejects, then reports the first failure', async () => {
    const closed: string[] = [];
    const throwing = {
      close(): Promise<void> {
        throw new Error('thrown at once');
      },
    };
    const rejecting = { close: async () => Promise.reject(new Error('rejected later')) };
    const fine = { close: async () => void closed.push('fine') };
    await expect(closeAll(throwing, rejecting, undefined, fine)).rejects.toThrow('thrown at once');
    expect(closed).toEqual(['fine']);
  });
});
