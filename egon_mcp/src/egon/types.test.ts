import { describe, expect, it } from 'vitest';
import { compareIds } from './types.js';

describe('compareIds', () => {
  it('orders ids by their number, whatever its length', () => {
    const ids = ['shape_10000', 'shape_9999', 'shape_0042', 'shape_100', 'shape_99999999999999999999', 'shape_100000000000000000000'];
    expect([...ids].sort(compareIds)).toEqual(['shape_0042', 'shape_100', 'shape_9999', 'shape_10000', 'shape_99999999999999999999', 'shape_100000000000000000000']);
  });

  it('takes linear time, also on long runs of zeros', () => {
    const long = '0'.repeat(20000) + 'x';
    const started = Date.now();
    for (let index = 0; index < 20; index += 1) {
      compareIds(long, `${long}y`);
      compareIds(`shape_${'0'.repeat(20000)}1`, `shape_${'0'.repeat(20000)}2`);
    }
    expect(Date.now() - started).toBeLessThan(200);
    expect(compareIds(`shape_${'0'.repeat(20000)}1`, `shape_${'0'.repeat(20000)}2`)).toBeLessThan(0);
  });

  it('keeps kinds apart and falls back to the text for ids without a number', () => {
    expect(['shape_2', 'connection_10', 'Actor', 'connection_9'].sort(compareIds)).toEqual(['Actor', 'connection_9', 'connection_10', 'shape_2']);
  });
});
