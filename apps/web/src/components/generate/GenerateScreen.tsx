'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ReceiptText, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadDraft } from '../../lib/kitchen-draft/draft-client';
import { draftMarker } from '../../lib/kitchen-draft/draft-marker';
import {
  canAct,
  claimLanding,
  generateHint,
  generateReducer,
  GENERATE_PATH,
  INITIAL_GENERATE_STATE,
  type Intent,
  parseIntent,
  shouldAutoClaim,
} from '../../lib/kitchen-draft/generate-state';
import { claimDraft } from '../../lib/kitchen-draft/project-client';
import { ALERT_ACTION_CLASS, GenerateAlert } from './GenerateAlert';
import { LoginGateSheet } from './LoginGateSheet';
import { ProjectSummary } from './ProjectSummary';

const CAPTURE_PATH = '/kitchen-projects/new';
const MOODBOARD_PATH = '/kitchen-projects/new/moodboard';

async function fetchSignedIn(): Promise<boolean> {
  try {
    const res = await fetch('/auth/session', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return false;
    const body = (await res.json()) as { signedIn?: unknown };
    return body.signedIn === true;
  } catch {
    return false;
  }
}

const CTAS: ReadonlyArray<{ intent: Intent; Icon: LucideIcon; primary: boolean }> = [
  { intent: 'render', Icon: Sparkles, primary: true },
  { intent: 'budget', Icon: ReceiptText, primary: false },
];

/**
 * Generate step (docs/design/login-gate-claim.md, frames 1-4 and panel 6): the summary of the
 * browser's draft and the costly actions. Anonymous visitors get the Login Gate; signed-in
 * Homeowners (or visitors returning from sign-in with `?intent=`) claim the draft and land on
 * the owned project. The HTML is the same for everyone: draft and session load on the client.
 */
export function GenerateScreen() {
  const t = useTranslations('generate');
  const router = useRouter();
  const [state, dispatch] = useReducer(generateReducer, INITIAL_GENERATE_STATE);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const pendingIntent = useRef<Intent | null>(null);
  const claiming = useRef(false);

  const load = useCallback(async () => {
    const [draft, signedIn] = await Promise.all([loadDraft(client()), fetchSignedIn()]);
    dispatch({ type: 'sessionKnown', signedIn });
    if (draft.kind === 'ok') {
      draftMarker('set');
      dispatch({ type: 'connectivity', online: true });
      dispatch({ type: 'draftLoaded', draft: draft.value });
    } else if (draft.kind === 'missing') {
      const expired = draftMarker('get');
      draftMarker('clear');
      dispatch({ type: 'connectivity', online: navigator.onLine });
      dispatch({ type: 'draftMissing', expired });
    } else {
      dispatch({ type: 'connectivity', online: false });
    }
  }, [client]);

  const runClaim = useCallback(
    async (intent: Intent) => {
      if (claiming.current) return;
      claiming.current = true;
      dispatch({ type: 'claimStarted', intent });
      const outcome = await claimDraft();
      claiming.current = false;
      if (outcome.kind === 'ok') {
        // The bm_draft cookie is gone; the marker must not turn the next 404 into "expired".
        draftMarker('clear');
        // Render intent: AI Results starts the first Render (controlnet-render); budget: the owned page.
        router.replace(claimLanding(outcome.projectId, intent));
        return;
      }
      dispatch({ type: 'claimFinished', outcome });
    },
    [router],
  );

  // Initial load, the intent from sign-in, and connectivity.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    pendingIntent.current = parseIntent(params.get('intent'));
    if (pendingIntent.current) window.history.replaceState(window.history.state, '', GENERATE_PATH);
    if (!navigator.onLine) dispatch({ type: 'connectivity', online: false });
    void load();
    const online = () => void load();
    const offline = () => dispatch({ type: 'connectivity', online: false });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [load]);

  // Back from sign-in with an intent: claim once the session and a ready draft are known.
  useEffect(() => {
    const intent = pendingIntent.current;
    if (!intent || state.phase === 'loading' || state.session === 'unknown') return;
    pendingIntent.current = null;
    if (shouldAutoClaim(state, intent)) void runClaim(intent);
  }, [state, runClaim]);

  const press = (intent: Intent) => {
    if (!canAct(state)) return;
    if (state.session === 'signedIn') void runClaim(intent);
    else dispatch({ type: 'ctaPressed', intent });
  };

  const active = canAct(state);
  const hint = generateHint(state);
  const draft = state.draft;
  const hintId = 'generate-hint';

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg" data-testid="generate-screen" data-phase={state.phase}>
        {!state.online ? <GenerateAlert tone="danger" message={t('alerts.offline')} testId="generate-offline" /> : null}
        {state.online && state.alert === 'wrongRole' ? (
          <GenerateAlert
            tone="warning"
            message={t('alerts.wrongRole')}
            testId="generate-wrong-role"
            action={
              <form method="post" action="/auth/logout">
                <button type="submit" data-testid="generate-signout" className={ALERT_ACTION_CLASS}>
                  {t('alerts.signOut')}
                </button>
              </form>
            }
          />
        ) : null}
        {state.online && state.alert === 'failed' ? (
          <GenerateAlert
            tone="danger"
            message={t('alerts.failed')}
            testId="generate-claim-failed"
            action={
              <button type="button" data-testid="generate-retry" className={ALERT_ACTION_CLASS} onClick={() => void runClaim(state.intent)}>
                <RefreshCw size={16} aria-hidden="true" />
                <span>{t('alerts.retry')}</span>
              </button>
            }
          />
        ) : null}
        {state.online && state.alert === 'expired' ? (
          <GenerateAlert
            tone="info"
            message={t('alerts.expired')}
            testId="generate-expired"
            action={
              <Link href={CAPTURE_PATH} prefetch={false} data-testid="generate-expired-start" className="flex h-11 items-center text-small leading-5 font-semibold text-primary underline">
                {t('alerts.start')}
              </Link>
            }
          />
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-small leading-5 font-semibold text-text-muted">{t('step', { current: 3, total: 3 })}</p>
            <div className="flex h-1 gap-1" aria-hidden="true">
              <span className="grow rounded-pill bg-primary" />
              <span className="grow rounded-pill bg-primary" />
              <span className="grow rounded-pill bg-primary" />
            </div>
          </div>
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>

        {state.phase === 'loading' ? null : (
          <ProjectSummary photos={draft?.photos ?? []} moodboard={draft?.moodboard ?? []} measurements={draft?.measurements ?? null} editable />
        )}
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {hint && state.online ? (
          <div className="flex flex-col gap-2">
            <p id={hintId} className="text-center text-small leading-5 text-text-muted" aria-live="polite" data-testid="generate-hint" data-hint={hint}>
              {t(`hints.${hint}`)}
            </p>
            <Link
              href={hint === 'items' ? MOODBOARD_PATH : CAPTURE_PATH}
              prefetch={false}
              data-testid="generate-hint-link"
              className="flex h-11 items-center justify-center gap-1 text-small leading-5 font-semibold text-primary underline"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>{t(hint === 'capture' ? 'hints.goToCapture' : hint === 'items' ? 'hints.goToMoodboard' : 'hints.startLink')}</span>
            </Link>
          </div>
        ) : null}
        {CTAS.map(({ intent, Icon, primary }) => (
          <button
            key={intent}
            type="button"
            data-testid={`generate-${intent}`}
            aria-disabled={!active}
            aria-describedby={!active && hint && state.online ? hintId : undefined}
            onClick={() => press(intent)}
            className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[13px] text-center text-body font-semibold ${
              !active
                ? 'cursor-not-allowed border border-border bg-surface-muted text-text-muted'
                : primary
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'border border-border bg-surface text-primary'
            }`}
          >
            <Icon size={20} aria-hidden="true" className="shrink-0" />
            <span>{t(`cta.${intent}`)}</span>
          </button>
        ))}
      </footer>

      <LoginGateSheet mode={state.sheet} intent={state.intent} onClose={() => dispatch({ type: 'gateClosed' })} />
    </>
  );
}
