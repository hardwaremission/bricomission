import { createHash } from 'node:crypto';
import type { DiagnosticsNodeId } from '@bricomission/shared-types';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/kitchen-projects/<uuid>/simulations/<uuid>` becomes `/kitchen-projects/:id/simulations/:id`. */
export function routeTemplate(path: string): string {
  return path.replace(UUID, ':id').replace(/\/+$/, '') || '/';
}

/**
 * The module node an HTTP route is served by (the target of the `api-guards` hop). Routes outside
 * the product API (health, docs, admin, GPU job debug, diagnostics) have no node and are not traced.
 */
export function targetForRoute(template: string): DiagnosticsNodeId | undefined {
  if (template === '/catalog/search' || template.startsWith('/catalog/')) return 'catalog-search';
  if (template.startsWith('/style-gallery')) return 'style-gallery';
  if (!template.startsWith('/kitchen-projects')) return undefined;
  if (/^\/kitchen-projects\/:id\/(simulations|selected-simulation|renders)(\/|$)/.test(template)) return 'simulation-runner';
  if (/^\/kitchen-projects\/:id\/(budget|budgets)(\/|$)/.test(template)) return 'budget-engine';
  return 'project-service';
}

/** High-frequency status polling (the web asks every 2 s): flagged `poll` so the dashboard coalesces it. */
export function isPollRoute(method: string, template: string): boolean {
  return method === 'GET' && /^\/kitchen-projects\/:id\/(simulations|budgets)\/:id$/.test(template);
}

/** 8-hex-char hash of a subject id: enough to tell users apart in a demo, never the id itself. */
export function subjectHash(sub: string): string {
  return createHash('sha256').update(sub).digest('hex').slice(0, 8);
}
