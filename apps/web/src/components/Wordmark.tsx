import { LogoShapes } from './brand/LogoShapes';
import { WORDMARK } from './brand/logo-paths';

/**
 * Header logo (docs/design/brand-logo-animation.md, "Header logo"): the SVG wordmark,
 * 140x22, ink `text` and blue corners `primary`, no dimension lines. The accessible name is
 * the brand name, which is never translated.
 */
export function Wordmark() {
  return (
    <svg
      role="img"
      aria-label="BricoMission"
      data-testid="wordmark"
      width={140}
      height={22}
      viewBox={WORDMARK.viewBox}
      className="block shrink-0"
      focusable="false"
    >
      <g className="fill-text" fillRule="evenodd">
        <LogoShapes shapes={WORDMARK.glyphs} />
      </g>
      <g className="fill-primary">
        <LogoShapes shapes={WORDMARK.accents} />
      </g>
    </svg>
  );
}
