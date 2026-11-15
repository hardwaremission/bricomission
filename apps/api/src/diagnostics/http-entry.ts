import type { NextFunction, Request, Response } from 'express';
import { currentCorrelation } from './correlation.js';
import type { Diagnostics } from './diagnostics.types.js';
import { isPollRoute, routeTemplate, subjectHash, targetForRoute } from './route-node-map.js';

/**
 * Express middleware of the HTTP entry (node `api-guards`): one span per product API request, from
 * `api-guards` to the module that serves the route. Mounted only when diagnostics are enabled, after the
 * correlation middleware. The end event carries status, ms, role names and a hashed subject.
 */
export function createHttpEntryMiddleware(diagnostics: Diagnostics) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const template = routeTemplate(req.originalUrl.split('?')[0] ?? req.path);
    const target = targetForRoute(template);
    if (!target || req.method === 'OPTIONS') {
      next();
      return;
    }
    const poll = isPollRoute(req.method, template);
    const ctx = currentCorrelation();
    if (ctx && poll) ctx.poll = true;
    const label = `${req.method} ${template}`;
    const span = diagnostics.span({ from: 'api-guards', to: target, kind: 'guard', summary: label, poll: poll || undefined, payload: { method: req.method, route: template } });
    let ended = false;
    const end = (aborted: boolean): void => {
      if (ended) return;
      ended = true;
      const user = (req as unknown as { user?: { sub?: string; roles?: string[] } }).user;
      const status = aborted ? 499 : res.statusCode;
      const guard = status === 401 || status === 403 ? `denied ${status}` : user ? `jwt ok role=${(user.roles ?? []).join(',') || 'none'}` : 'public or draft token';
      span.end({
        summary: `${label} -> ${status} (${guard})`,
        payload: { method: req.method, route: template, status, guard, roles: user?.roles ?? [], sub: user?.sub ? subjectHash(user.sub) : null },
        ok: status < 400,
      });
    };
    res.on('finish', () => end(false));
    res.on('close', () => end(true));
    next();
  };
}
