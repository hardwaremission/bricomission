import { authRuntime } from '../../../lib/auth/runtime';

// Feature homeowner-password-login: see src/lib/auth/handlers.ts (form POST, Origin checked).
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return authRuntime().handlers.logout(request);
}
