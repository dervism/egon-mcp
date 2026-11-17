import { describe, expect, it } from 'vitest';
import { boundsOf, centerOf, edgeWaypoints, routeEdge } from './geometry.js';

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

  describe('routeEdge', () => {
    const left = { x: 0, y: 100, width: 75, height: 75 };
    const middle = { x: 200, y: 100, width: 75, height: 75 };
    const right = { x: 400, y: 100, width: 75, height: 75 };

    it('goes straight when nothing is in the way', () => {
      expect(routeEdge(left, middle, [right])).toEqual(edgeWaypoints(left, middle));
    });

    it('bends over shapes that sit on the straight line', () => {
      const route = routeEdge(right, left, [middle]);
      expect(route).toHaveLength(4);
      const [start, up, across, end] = route;
      expect(start).toMatchObject({ x: 438, y: 100 });
      expect(up!.x).toBe(438);
      expect(up!.y).toBeLessThan(100);
      expect(across).toMatchObject({ x: 38, y: up!.y });
      expect(end).toMatchObject({ x: 38, y: 100 });
    });

    it('bends to the side when the shapes are stacked vertically', () => {
      const top = { x: 100, y: 0, width: 75, height: 75 };
      const between = { x: 100, y: 200, width: 75, height: 75 };
      const bottom = { x: 100, y: 400, width: 75, height: 75 };
      const route = routeEdge(top, bottom, [between]);
      expect(route).toHaveLength(4);
      expect(route[1]!.x).toBeGreaterThan(175);
      expect(route[0]).toMatchObject({ x: 175, y: 38 });
      expect(route[3]).toMatchObject({ x: 175, y: 438 });
    });
  });
});
