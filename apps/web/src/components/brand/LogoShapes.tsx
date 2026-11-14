import type { LogoShape } from './logo-paths';

/** Renders logo shapes from logo-paths.ts (paths verbatim from the design exports). */
export function LogoShapes({ shapes }: { shapes: readonly LogoShape[] }) {
  return shapes.map((shape, i) =>
    shape.kind === 'path' ? <path key={i} d={shape.d} /> : <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} />,
  );
}
