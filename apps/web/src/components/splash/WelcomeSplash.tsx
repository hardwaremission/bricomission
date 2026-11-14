import type { CSSProperties, SVGAttributes } from 'react';
import { SPLASH_OVERLAY_ID } from './splash-script';
import { LETTERMARK_STAGE, WORDMARK_STAGE, type SplashStage, type StageElement } from './splash-stages';
import styles from './WelcomeSplash.module.css';

/**
 * Welcome splash (feature brand-logo-animation; design: docs/design/brand-logo-animation.md,
 * "Welcome splash"). Always server-rendered as the first child of <body> and hidden by default;
 * the inline head script (splash-script.ts) sets <html data-splash="play"> when it should play.
 * Variant (lettermark < 768 px, wordmark >= 768 px) and palette (prefers-color-scheme) are pure
 * CSS, so there is no React state and nothing to hydrate. The overlay is aria-hidden with no
 * focusable content, and the SVGs carry no title or role: the page under it is announced once.
 */

/** HTML attribute names of the stage SVGs -> React prop names. */
const PROP: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'fill-rule': 'fillRule',
};

function props(attrs: Readonly<Record<string, string>>): SVGAttributes<SVGElement> {
  return Object.fromEntries(Object.entries(attrs).map(([name, value]) => [PROP[name] ?? name, value]));
}

function classes(names: string | null): string | undefined {
  return names ? names.split(' ').map((name) => styles[name] ?? name).join(' ') : undefined;
}

function Element({ element }: { element: StageElement }) {
  const common = { className: classes(element.className), style: element.vars as CSSProperties, ...props(element.attrs) };
  if (element.tag === 'line') return <line {...common} />;
  if (element.tag === 'circle') return <circle {...common} />;
  return <path {...common} />;
}

function Stage({ stage, className, variant }: { stage: SplashStage; className: string; variant: string }) {
  return (
    <svg className={`${styles.stage} ${className}`} data-variant={variant} viewBox={stage.viewBox} fill="none" focusable="false" aria-hidden="true">
      {stage.groups.map((group) => (
        <g key={group.id} data-group={group.id} className={classes(group.className)} {...props(group.attrs)}>
          {group.elements.map((element, i) => (
            <Element key={i} element={element} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function WelcomeSplash() {
  return (
    <div id={SPLASH_OVERLAY_ID} className={styles.overlay} aria-hidden="true" data-testid="welcome-splash">
      <Stage stage={LETTERMARK_STAGE} className={styles.lm ?? ''} variant="lettermark" />
      <Stage stage={WORDMARK_STAGE} className={styles.wm ?? ''} variant="wordmark" />
    </div>
  );
}
