import type { Point, Rect } from './layout.ts';

export interface Segment {
  a: Point;
  b: Point;
}

export function segmentsOf(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i += 1) out.push({ a: points[i - 1], b: points[i] });
  return out;
}

export function isOrthogonal(points: Point[]): boolean {
  return segmentsOf(points).every(({ a, b }) => (a[0] === b[0]) !== (a[1] === b[1]));
}

/** True when the segment shares more than its border with the rectangle (touching an edge of the box is allowed: that is where pins sit). */
export function segmentCrossesRect(segment: Segment, rect: Rect): boolean {
  const x1 = Math.min(segment.a[0], segment.b[0]);
  const x2 = Math.max(segment.a[0], segment.b[0]);
  const y1 = Math.min(segment.a[1], segment.b[1]);
  const y2 = Math.max(segment.a[1], segment.b[1]);
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  if (y1 === y2) return y1 > top && y1 < bottom && x2 > left && x1 < right;
  return x1 > left && x1 < right && y2 > top && y1 < bottom;
}

export function polylineLength(points: Point[]): number {
  return segmentsOf(points).reduce((sum, { a, b }) => sum + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), 0);
}

/** Point at `fraction` (0 to 1) of the polyline's length. */
export function pointAt(points: Point[], fraction: number): Point {
  const total = polylineLength(points);
  let left = Math.min(1, Math.max(0, fraction)) * total;
  for (const { a, b } of segmentsOf(points)) {
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    if (left <= length && length > 0) {
      const t = left / length;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= length;
  }
  return points[points.length - 1];
}

export function pathData(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

/** About 600 ms per hop; long lanes take proportionally longer so the packet speed stays readable. */
export function packetDurationMs(length: number): number {
  return Math.round(Math.min(1800, Math.max(600, length * 2.2)));
}

/** Zoom and offset that fit the 1360x1024 graph inside a canvas of the given size, centred. */
export function fitViewport(canvasW: number, canvasH: number, graphW: number, graphH: number): { x: number; y: number; zoom: number } {
  const zoom = Math.min(canvasW / graphW, canvasH / graphH, 1.5);
  return { zoom, x: (canvasW - graphW * zoom) / 2, y: (canvasH - graphH * zoom) / 2 };
}
