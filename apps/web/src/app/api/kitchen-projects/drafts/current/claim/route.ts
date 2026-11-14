import { readAuthConfig } from '../../../../../../lib/auth/config';
import { authRuntime } from '../../../../../../lib/auth/runtime';
import { createClaimDraftHandler } from '../../../../../../lib/kitchen-draft/claim-draft';

// BFF route (static, so it wins over api/[...path] for this one path): claims the browser's
// anonymous draft for the signed-in Account and clears the bm_draft cookie (login-gate-claim).
export const dynamic = 'force-dynamic';

const claimDraft = createClaimDraftHandler({
  baseUrl: () => process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3000',
  secureCookies: () => readAuthConfig().webPublicUrl.startsWith('https:'),
  resolveAccessToken: (cookieHeader) => authRuntime().sessions.getValidAccessToken(cookieHeader),
});

export const POST = claimDraft;
