import { createApiProxy } from '../../../lib/api-proxy';

// Runtime env (not next.config rewrites, which standalone output bakes in at build time).
export const dynamic = 'force-dynamic';

const proxy = createApiProxy({ baseUrl: () => process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3000' });

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
