import { readAuthConfig } from '../../../../lib/auth/config';
import { createStartDraftHandler } from '../../../../lib/kitchen-draft/start-draft';

// BFF route (static, so it wins over api/[...path] for this one path): starts or resumes the
// browser's anonymous kitchen draft and keeps its token in the HttpOnly bm_draft cookie.
export const dynamic = 'force-dynamic';

const startDraft = createStartDraftHandler({
  baseUrl: () => process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3000',
  secureCookies: () => readAuthConfig().webPublicUrl.startsWith('https:'),
});

export const POST = startDraft;
