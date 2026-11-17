import { describe, expect, it } from 'vitest';
import { closeAll } from './close-all.js';

describe('closeAll', () => {
  it('closes everything even when a close throws or rejects, then reports the first failure in argument order', async () => {
    const calls: string[] = [];
    const rejecting = {
      close: async () => {
        calls.push('rejecting');
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('rejected later');
      },
    };
    const throwing = {
      close(): Promise<void> {
        calls.push('throwing');
        throw new Error('thrown at once');
      },
    };
    const fine = { close: async () => void calls.push('fine') };
    await expect(closeAll(rejecting, throwing, undefined, fine)).rejects.toThrow('rejected later');
    expect(calls).toEqual(['rejecting', 'throwing', 'fine']);
  });
});
