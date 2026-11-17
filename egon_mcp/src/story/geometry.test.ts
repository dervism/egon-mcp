import { describe, expect, it } from 'vitest';
import { boundsOf, centerOf, edgeWaypoints } from './geometry.js';

describe('geometry', () => {
  const actor = { x: 100, y: 100, width: 75, height: 75 };
  const workObject = { x: 300, y: 100, width: 75, height: 75 };

  it('uses Egon default sizes when a shape has none', () => {
    expect(boundsOf({ x: 10, y: 20, type: 'domainStory:actorPerson' })).toEqual({ x: 10, y: 20, width: 75, height: 75 });
    expect(boundsOf({ x: 0, y: 0, type: 'domainStory:group' })).toEqual({ x: 0, y: 0, width: 300, height: 200 });
    expect(boundsOf({ x: 0, y: 0, type: 'domainStory:textAnnotation' })).toEqual({ x: 0, y: 0, width: 100, height: 30 });
  });

  it('computes the center of a shape from its top-left corner', () => {
    expect(centerOf(actor)).toEqual({ x: 137.5, y: 137.5 });
  });

  it('runs an edge from border to border along the line between centers', () => {
    const [start, end] = edgeWaypoints(actor, workObject);
    expect(start).toEqual({ x: 175, y: 138, original: { x: 175, y: 138 } });
    expect(end).toEqual({ x: 300, y: 138, original: { x: 300, y: 138 } });
  });

  it('crops diagonal edges at the shape borders', () => {
    const below = { x: 100, y: 300, width: 75, height: 75 };
    const [start, end] = edgeWaypoints(actor, below);
    expect(start).toMatchObject({ x: 138, y: 175 });
    expect(end).toMatchObject({ x: 138, y: 300 });

    const diagonal = { x: 300, y: 300, width: 75, height: 75 };
    const [s, e] = edgeWaypoints(actor, diagonal);
    expect(s).toMatchObject({ x: 175, y: 175 });
    expect(e).toMatchObject({ x: 300, y: 300 });
  });

  it('rounds waypoints to whole pixels like Egon', () => {
    const odd = { x: 0, y: 0, width: 75, height: 75 };
    const other = { x: 201, y: 33, width: 75, height: 75 };
    for (const point of edgeWaypoints(odd, other)) {
      expect(Number.isInteger(point.x)).toBe(true);
      expect(Number.isInteger(point.y)).toBe(true);
    }
  });
});
