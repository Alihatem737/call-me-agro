import type { FarmCoordinates } from '../services/plan-draft.service';

export type FieldBoundary = FarmCoordinates[];

export function isValidFieldBoundary(value: unknown): value is FieldBoundary {
  if (!Array.isArray(value) || value.length < 3 || !value.every(isVertex)) return false;

  const first = value[0];
  const points = value.map(point => ({
    x: point.longitude + 360 * Math.round((first.longitude - point.longitude) / 360) - first.longitude,
    y: point.latitude - first.latitude,
  }));
  const count = points.length;
  const longitudeRange = points.reduce(({ min, max }, point) =>
    ({ min: Math.min(min, point.x), max: Math.max(max, point.x) }), { min: 0, max: 0 });
  if (longitudeRange.max - longitudeRange.min >= 180) return false;
  if (new Set(points.map(point => `${point.x},${point.y}`)).size !== count) return false;

  let area = 0;
  for (let index = 0; index < count; index++) {
    const start = points[index];
    const end = points[(index + 1) % count];
    const next = points[(index + 2) % count];
    if (orientation(start, end, next) === 0 &&
        ((start.x - end.x) * (next.x - end.x) + (start.y - end.y) * (next.y - end.y)) > 0) return false;

    area += start.x * end.y - end.x * start.y;
    for (let other = index + 2; other < count; other++) {
      if (index === 0 && other === count - 1) continue;
      if (intersects(start, end, points[other], points[(other + 1) % count])) return false;
    }
  }
  return area !== 0;
}

function isVertex(value: unknown): value is FarmCoordinates {
  if (!value || typeof value !== 'object' || !('latitude' in value) || !('longitude' in value)) return false;
  return typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

interface Point {
  x: number;
  y: number;
}

function orientation(a: Point, b: Point, c: Point): number {
  const left = (b.x - a.x) * (c.y - a.y);
  const right = (b.y - a.y) * (c.x - a.x);
  return Math.abs(left - right) <= (Math.abs(left) + Math.abs(right)) * Number.EPSILON * 4
    ? 0 : Math.sign(left - right);
}

function contains(a: Point, b: Point, point: Point): boolean {
  return point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return (abc * abd < 0 && cda * cdb < 0)
    || (abc === 0 && contains(a, b, c)) || (abd === 0 && contains(a, b, d))
    || (cda === 0 && contains(c, d, a)) || (cdb === 0 && contains(c, d, b));
}
