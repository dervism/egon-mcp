import { describe, expect, it } from 'vitest';
import { compareIds } from './types.js';

describe('compareIds', () => {
  it('orders ids by their number, whatever its length', () => {
    const ids = ['shape_10000', 'shape_9999', 'shape_0042', 'shape_100', 'shape_99999999999999999999', 'shape_100000000000000000000'];
    expect([...ids].sort(compareIds)).toEqual(['shape_0042', 'shape_100', 'shape_9999', 'shape_10000', 'shape_99999999999999999999', 'shape_100000000000000000000']);
  });

  it('keeps kinds apart and falls back to the text for ids without a number', () => {
    expect(['shape_2', 'connection_10', 'Actor', 'connection_9'].sort(compareIds)).toEqual(['Actor', 'connection_9', 'connection_10', 'shape_2']);
  });
});
