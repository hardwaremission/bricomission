'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, ReceiptText, Sparkles } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadProject, type ProjectLoad } from '../../lib/kitchen-draft/project-client';
import { loadRenders } from '../../lib/renders/render-client';
import { GenerateAlert } from './GenerateAlert';
import { ProjectSummary } from './ProjectSummary';

/**
 * Owned Kitchen Project (docs/design/login-gate-claim.md, frame 5 and panel 6): read-only summary
 * of a claimed project, the "saved" confirmation after a claim (`?claimed=1`), and the costly
 * actions (docs/design/controlnet-render.md, panel 4): "Generate my kitchen" opens AI Results and
 * starts a Render (`?start=1`), "See my designs" once a Render succeeded; "Get my budget" stays
 * disabled until budget-tier-computation.
 * Signed out: a sign-in prompt that returns here. Unknown or another Account's project: not found.
 */
export function OwnedProjectScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('project');
  const tGen = useTranslations('generate');
  const [result, setResult] = useState<ProjectLoad | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [hasDesigns, setHasDesigns] = useState(false);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);

  const load = useCallback(async () => {
    if (!navigator.onLine) return setResult({ kind: 'offline' });
    const [project, renders] = await Promise.all([loadProject(client(), projectId), loadRenders(client(), projectId)]);
    setResult(project);
    if (renders.kind === 'ok') setHasDesigns(renders.value.renders.some((render) => render.status === 'succeeded'));
  }, [client, projectId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('claimed') === '1') {
      setClaimed(true);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    void load();
    const online = () => void load();
    const offline = () => setResult((current) => (current?.kind === 'ok' ? current : { kind: 'offline' }));
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [load]);

  const kind = result?.kind ?? 'loading';

  if (kind === 'signedOut') {
    const href = `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${projectId}`)}`;
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg" data-testid="project-signed-out">
        <h1 className="text-h1 font-bold text-text">{t('signedOut.title')}</h1>
        <a
          href={href}
          data-testid="project-sign-in"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          {t('signedOut.signIn')}
        </a>
      </main>
    );
  }

  if (kind === 'notFound' || kind === 'missing') {
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg" data-testid="project-not-found">
        <h1 className="text-h1 font-bold text-text">{t('notFound.title')}</h1>
        <Link href="/" prefetch={false} data-testid="project-home" className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline">
          {t('notFound.home')}
        </Link>
      </main>
    );
  }

  const project = result?.kind === 'ok' ? result.value : null;
  const offline = kind === 'offline' || kind === 'error';
  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg" data-testid="project-screen" data-state={kind}>
        {offline ? <GenerateAlert tone="danger" message={t('offline')} testId="project-offline" /> : null}
        {claimed && project ? (
          <GenerateAlert tone="success" message={t('claimed')} testId="project-claimed" onDismiss={() => setClaimed(false)} dismissLabel={t('dismiss')} />
        ) : null}
        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>
        {project ? (
          <ProjectSummary photos={project.photos} moodboard={project.moodboard} measurements={project.measurements} editable={false} />
        ) : null}
        <Link
          href="/kitchen-projects/new"
          prefetch={false}
          data-testid="project-new"
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 text-small leading-5 font-semibold text-primary underline"
        >
          <Plus size={16} aria-hidden="true" />
          <span>{t('newProject')}</span>
        </Link>
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {project ? (
          <Link
            href={`/kitchen-projects/${projectId}/results${hasDesigns ? '' : '?start=1'}`}
            prefetch={false}
            data-testid="project-render"
            className="flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill bg-primary px-md py-[13px] text-center text-body font-semibold text-white hover:bg-primary-hover"
          >
            <Sparkles size={20} aria-hidden="true" className="shrink-0" />
            <span>{hasDesigns ? t('seeDesigns') : tGen('cta.render')}</span>
          </Link>
        ) : (
          <button
            type="button"
            data-testid="project-render"
            aria-disabled="true"
            className="flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-sm rounded-pill border border-border bg-surface-muted px-md py-[13px] text-center text-body font-semibold text-text-muted"
          >
            <Sparkles size={20} aria-hidden="true" className="shrink-0" />
            <span>{tGen('cta.render')}</span>
          </button>
        )}
        <button
          type="button"
          data-testid="project-budget"
          aria-disabled="true"
          aria-describedby="project-budgets-soon"
          className="flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-sm rounded-pill border border-border bg-surface-muted px-md py-[13px] text-center text-body font-semibold text-text-muted"
        >
          <ReceiptText size={20} aria-hidden="true" className="shrink-0" />
          <span>{tGen('cta.budget')}</span>
        </button>
        <p id="project-budgets-soon" className="text-center text-small leading-5 text-text-muted" data-testid="project-budgets-soon">
          {t('budgetsSoon')}
        </p>
      </footer>
    </>
  );
}
