import { GROUP_TYPE, TEXT_ANNOTATION_TYPE, type Point, type Waypoint } from '../egon/types.js';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Egon's default shape sizes (DomainStoryElementFactory._getShapeSize). */
export const DEFAULT_SHAPE_SIZE = { width: 75, height: 75 };
export const DEFAULT_GROUP_SIZE = { width: 300, height: 200 };
export const DEFAULT_ANNOTATION_SIZE = { width: 100, height: 30 };

export function defaultSizeFor(type: string): { width: number; height: number } {
  if (type === GROUP_TYPE) {
    return DEFAULT_GROUP_SIZE;
  }
  if (type === TEXT_ANNOTATION_TYPE) {
    return DEFAULT_ANNOTATION_SIZE;
  }
  return DEFAULT_SHAPE_SIZE;
}

/** Bounds of a shape element; x/y is the top-left corner, as in Egon. */
export function boundsOf(shape: { x: number; y: number; width?: unknown; height?: unknown; type?: string }): Bounds {
  const size = defaultSizeFor(shape.type ?? '');
  return {
    x: shape.x,
    y: shape.y,
    width: typeof shape.width === 'number' && shape.width > 0 ? shape.width : size.width,
    height: typeof shape.height === 'number' && shape.height > 0 ? shape.height : size.height,
  };
}

export function centerOf(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/**
 * A straight edge from the border of `source` to the border of `target`,
 * following the line between their centers.
 */
export function edgeWaypoints(source: Bounds, target: Bounds): [Waypoint, Waypoint] {
  const from = centerOf(source);
  const to = centerOf(target);
  const start = cropAtBorder(from, to, source);
  const end = cropAtBorder(to, from, target);
  return [waypoint(start), waypoint(end)];
}

/** The point where the ray from `inside` (the center of `bounds`) towards `toward` leaves `bounds`. */
function cropAtBorder(inside: Point, toward: Point, bounds: Bounds): Point {
  const dx = toward.x - inside.x;
  const dy = toward.y - inside.y;
  if (dx === 0 && dy === 0) {
    return inside;
  }
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: inside.x + dx * scale, y: inside.y + dy * scale };
}

function waypoint(point: Point): Waypoint {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  return { x, y, original: { x, y } };
}

const ROUTE_CLEARANCE = 40;

/**
 * Like edgeWaypoints, but when the straight line would cross one of the
 * `obstacles`, the edge leaves the source from the top, runs above the
 * obstacles and drops into the target from the top. Shapes stacked in one
 * column get a detour to the right instead.
 */
export function routeEdge(source: Bounds, target: Bounds, obstacles: Bounds[]): Waypoint[] {
  const straight = edgeWaypoints(source, target);
  const blocking = obstacles.filter((box) => segmentHitsBox(straight[0], straight[1], inflate(box, 4)));
  if (blocking.length === 0) {
    return straight;
  }
  const from = centerOf(source);
  const to = centerOf(target);
  const involved = [source, target, ...blocking];
  if (Math.abs(from.x - to.x) < Math.min(source.width, target.width) / 2) {
    const laneX = Math.max(...involved.map((box) => box.x + box.width)) + ROUTE_CLEARANCE;
    return [
      waypoint({ x: source.x + source.width, y: from.y }),
      waypoint({ x: laneX, y: from.y }),
      waypoint({ x: laneX, y: to.y }),
      waypoint({ x: target.x + target.width, y: to.y }),
    ];
  }
  const laneY = Math.min(...involved.map((box) => box.y)) - ROUTE_CLEARANCE;
  return [
    waypoint({ x: from.x, y: source.y }),
    waypoint({ x: from.x, y: laneY }),
    waypoint({ x: to.x, y: laneY }),
    waypoint({ x: to.x, y: target.y }),
  ];
}

function inflate(box: Bounds, by: number): Bounds {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/** Liang-Barsky clipping: does the segment from a to b pass through the box? */
function segmentHitsBox(a: Point, b: Point, box: Bounds): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }
    if (t0 > t1) {
      return false;
    }
  }
  return true;
}
