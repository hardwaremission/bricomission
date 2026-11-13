import { authRuntime } from '../../../lib/auth/runtime';

// Feature homeowner-password-login: see src/lib/auth/handlers.ts.
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return authRuntime().handlers.login(request);
}
