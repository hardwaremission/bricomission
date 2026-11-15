export const dynamic = 'force-dynamic';

/** Liveness of the dashboard server itself (compose healthcheck). It does not depend on the API or the agent. */
export function GET(): Response {
  return Response.json({ status: 'ok' });
}
