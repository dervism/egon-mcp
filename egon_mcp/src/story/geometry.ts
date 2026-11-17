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
