import { readinessHint } from './readiness';
import type { KitchenDraftView } from './types';

/** The costly action a visitor asked for; carried through sign-in as `?intent=`. */
export type Intent = 'render' | 'budget';
export const INTENTS: readonly Intent[] = ['render', 'budget'];

export const GENERATE_PATH = '/kitchen-projects/new/generate';

export function parseIntent(value: string | null | undefined): Intent | null {
  return value === 'render' || value === 'budget' ? value : null;
}

/** `/auth/login` URL that returns to Generate with the intent (and opens Keycloak sign-up with `register`). */
export function loginUrl(intent: Intent, register = false): string {
  const returnTo = `${GENERATE_PATH}?intent=${intent}`;
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}${register ? '&mode=register' : ''}`;
}

/**
 * Where a successful claim lands: the render intent opens AI Results and starts the first Render
 * (controlnet-render OQ-8); the budget intent stays on the owned project page.
 */
export function claimLanding(projectId: string, intent: Intent): string {
  return intent === 'render' ? `/kitchen-projects/${projectId}/results?claimed=1&start=1` : `/kitchen-projects/${projectId}?claimed=1`;
}

/** Outcome of `POST /api/kitchen-projects/drafts/current/claim`. */
export type ClaimOutcome =
  | { kind: 'ok'; projectId: string }
  /** 401: the session is gone; show the gate again. */
  | { kind: 'unauthorized' }
  /** 403: Professional or Administrator account. */
  | { kind: 'forbidden' }
  /** 404: the draft expired (or is gone); the cookie was cleared. */
  | { kind: 'missing' }
  /** Network error while the browser is offline. */
  | { kind: 'offline' }
  /** 502, 503, anything else: retryable. */
  | { kind: 'failed' };

export function claimOutcome(status: number, projectId?: unknown): ClaimOutcome {
  if (status === 200 && typeof projectId === 'string') return { kind: 'ok', projectId };
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'missing' };
  return { kind: 'failed' };
}

export interface GenerateState {
  /** The draft: still loading, loaded, or none (never started, expired or already claimed). */
  phase: 'loading' | 'ready' | 'missing';
  draft: KitchenDraftView | null;
  session: 'unknown' | 'anonymous' | 'signedIn';
  online: boolean;
  /** The Login Gate sheet or the claiming sheet. */
  sheet: 'none' | 'gate' | 'claiming';
  intent: Intent;
  alert: 'none' | 'wrongRole' | 'failed' | 'expired';
}

export const INITIAL_GENERATE_STATE: GenerateState = {
  phase: 'loading',
  draft: null,
  session: 'unknown',
  online: true,
  sheet: 'none',
  intent: 'render',
  alert: 'none',
};

export type GenerateAction =
  | { type: 'draftLoaded'; draft: KitchenDraftView }
  | { type: 'draftMissing'; expired: boolean }
  | { type: 'sessionKnown'; signedIn: boolean }
  | { type: 'connectivity'; online: boolean }
  | { type: 'ctaPressed'; intent: Intent }
  | { type: 'gateClosed' }
  | { type: 'claimStarted'; intent: Intent }
  | { type: 'claimFinished'; outcome: ClaimOutcome }
  | { type: 'alertDismissed' };

export function generateReducer(state: GenerateState, action: GenerateAction): GenerateState {
  switch (action.type) {
    case 'draftLoaded':
      return { ...state, phase: 'ready', draft: action.draft, alert: state.alert === 'expired' ? 'none' : state.alert };
    case 'draftMissing':
      return { ...state, phase: 'missing', draft: null, alert: action.expired ? 'expired' : state.alert === 'expired' ? 'none' : state.alert };
    case 'sessionKnown':
      return { ...state, session: action.signedIn ? 'signedIn' : 'anonymous' };
    case 'connectivity':
      return { ...state, online: action.online, sheet: !action.online && state.sheet === 'gate' ? 'none' : state.sheet };
    case 'ctaPressed': {
      if (!canAct(state)) return state;
      // Signed-in visitors claim at once; everyone else sees the Login Gate first.
      return { ...state, intent: action.intent, sheet: state.session === 'signedIn' ? 'claiming' : 'gate', alert: 'none' };
    }
    case 'gateClosed':
      return state.sheet === 'gate' ? { ...state, sheet: 'none' } : state;
    case 'claimStarted':
      return { ...state, intent: action.intent, sheet: 'claiming', alert: 'none' };
    case 'claimFinished': {
      const { outcome } = action;
      switch (outcome.kind) {
        case 'ok':
          // The page navigates away; keep the claiming sheet up until it does.
          return state;
        case 'unauthorized':
          return { ...state, session: 'anonymous', sheet: 'gate' };
        case 'forbidden':
          return { ...state, sheet: 'none', alert: 'wrongRole' };
        case 'missing':
          return { ...state, sheet: 'none', phase: 'missing', draft: null, alert: 'expired' };
        case 'offline':
          return { ...state, sheet: 'none', online: false, alert: 'none' };
        case 'failed':
          return { ...state, sheet: 'none', alert: 'failed' };
      }
      return state;
    }
    case 'alertDismissed':
      return { ...state, alert: 'none' };
  }
}

/** Why both CTAs are disabled (bottom-bar hint), or null when the draft is ready. */
export function generateHint(state: GenerateState): 'capture' | 'items' | 'start' | null {
  if (state.phase === 'missing') return 'start';
  if (state.phase !== 'ready' || !state.draft) return null;
  return readinessHint(state.draft);
}

/** The CTAs are active: a ready draft, online, and no sheet open. */
export function canAct(state: GenerateState): boolean {
  return state.phase === 'ready' && state.draft !== null && state.online && state.sheet === 'none' && readinessHint(state.draft) === null;
}

/**
 * After returning from sign-in with `?intent=`: claim automatically once the session says
 * signed in and the draft is ready. Without an intent a signed-in visitor is never claimed
 * automatically (login-gate-claim OQ-5).
 */
export function shouldAutoClaim(state: GenerateState, intent: Intent | null): boolean {
  return intent !== null && state.session === 'signedIn' && state.alert === 'none' && canAct(state);
}
