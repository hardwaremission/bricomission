import { LogoShapes } from './LogoShapes';
import { LETTERMARK } from './logo-paths';

/**
 * BM lettermark (docs/design/brand-logo-animation.md): ink `text`, blue corners `primary`,
 * no dimension lines. Decorative unless a `label` is given.
 */
export function Lettermark({ width, height, label }: { width: number; height: number; label?: string }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={LETTERMARK.viewBox}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g className="fill-text" fillRule="evenodd">
        <LogoShapes shapes={LETTERMARK.glyphs} />
      </g>
      <g className="fill-primary">
        <LogoShapes shapes={LETTERMARK.accents} />
      </g>
    </svg>
  );
}
