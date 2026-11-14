import { describe, expect, it } from 'vitest';
import {
  canAct,
  claimLanding,
  claimOutcome,
  generateHint,
  generateReducer,
  type GenerateState,
  INITIAL_GENERATE_STATE,
  loginUrl,
  parseIntent,
  shouldAutoClaim,
} from '../src/lib/kitchen-draft/generate-state';
import type { KitchenDraftView } from '../src/lib/kitchen-draft/types';

const ready = {
  id: 'd1',
  status: 'draft',
  measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 },
  photos: [{ id: 'p', position: 0, width: 1, height: 1, thumbUrl: '/t', fullUrl: '/f' }],
  moodboard: [{ id: 'm', source: 'gallery', galleryImageId: 'modern-01', styleId: 'modern', position: 0, width: 1, height: 1, thumbUrl: '/t', fullUrl: '/f' }],
  limits: { maxPhotos: 8, maxPhotoBytes: 1, maxMoodboardItems: 12 },
  expiresAt: '2026-11-20T00:00:00.000Z',
} as KitchenDraftView;

const reduce = (...actions: Parameters<typeof generateReducer>[1][]) => actions.reduce(generateReducer, INITIAL_GENERATE_STATE);

describe('generate state', () => {
  it('claimLanding: render opens AI Results with an automatic start, budget the owned page', () => {
    expect(claimLanding('p1', 'render')).toBe('/kitchen-projects/p1/results?claimed=1&start=1');
    expect(claimLanding('p1', 'budget')).toBe('/kitchen-projects/p1?claimed=1');
  });

  it('parses the intent and builds login URLs (returnTo with intent, register mode)', () => {
    expect(parseIntent('render')).toBe('render');
    expect(parseIntent('budget')).toBe('budget');
    expect(parseIntent('x')).toBeNull();
    expect(parseIntent(null)).toBeNull();
    expect(loginUrl('render')).toBe('/auth/login?returnTo=%2Fkitchen-projects%2Fnew%2Fgenerate%3Fintent%3Drender');
    expect(loginUrl('budget', true)).toBe('/auth/login?returnTo=%2Fkitchen-projects%2Fnew%2Fgenerate%3Fintent%3Dbudget&mode=register');
  });

  it('maps claim statuses', () => {
    expect(claimOutcome(200, 'id')).toEqual({ kind: 'ok', projectId: 'id' });
    expect(claimOutcome(200)).toEqual({ kind: 'failed' });
    expect(claimOutcome(401).kind).toBe('unauthorized');
    expect(claimOutcome(403).kind).toBe('forbidden');
    expect(claimOutcome(404).kind).toBe('missing');
    expect(claimOutcome(502).kind).toBe('failed');
    expect(claimOutcome(503).kind).toBe('failed');
  });

  it('CTA: anonymous opens the gate; signed in claims; not ready does nothing', () => {
    const anon = reduce({ type: 'draftLoaded', draft: ready }, { type: 'sessionKnown', signedIn: false });
    expect(canAct(anon)).toBe(true);
    expect(generateReducer(anon, { type: 'ctaPressed', intent: 'budget' })).toMatchObject({ sheet: 'gate', intent: 'budget' });
    const signed = generateReducer(anon, { type: 'sessionKnown', signedIn: true });
    expect(generateReducer(signed, { type: 'ctaPressed', intent: 'render' }).sheet).toBe('claiming');
    const incomplete = reduce({ type: 'draftLoaded', draft: { ...ready, moodboard: [] } });
    expect(canAct(incomplete)).toBe(false);
    expect(generateHint(incomplete)).toBe('items');
    expect(generateReducer(incomplete, { type: 'ctaPressed', intent: 'render' })).toBe(incomplete);
  });

  it('hints: start without a draft, capture when Capture is incomplete; offline disables', () => {
    expect(generateHint(reduce({ type: 'draftMissing', expired: false }))).toBe('start');
    expect(reduce({ type: 'draftMissing', expired: true }).alert).toBe('expired');
    expect(generateHint(reduce({ type: 'draftLoaded', draft: { ...ready, photos: [] } }))).toBe('capture');
    expect(canAct(reduce({ type: 'draftLoaded', draft: ready }, { type: 'connectivity', online: false }))).toBe(false);
  });

  it('auto-claim only with intent, a signed-in session and a ready draft', () => {
    const base = reduce({ type: 'draftLoaded', draft: ready }, { type: 'sessionKnown', signedIn: true });
    expect(shouldAutoClaim(base, 'render')).toBe(true);
    expect(shouldAutoClaim(base, null)).toBe(false);
    expect(shouldAutoClaim(generateReducer(base, { type: 'sessionKnown', signedIn: false }), 'render')).toBe(false);
    expect(shouldAutoClaim(reduce({ type: 'draftMissing', expired: false }, { type: 'sessionKnown', signedIn: true }), 'render')).toBe(false);
  });

  it('claim outcomes: 401 reopens the gate, 403 wrong role, 404 expired, failed keeps the draft', () => {
    const claiming: GenerateState = generateReducer(reduce({ type: 'draftLoaded', draft: ready }), { type: 'claimStarted', intent: 'render' });
    expect(claiming.sheet).toBe('claiming');
    expect(generateReducer(claiming, { type: 'claimFinished', outcome: { kind: 'unauthorized' } })).toMatchObject({ sheet: 'gate', session: 'anonymous' });
    expect(generateReducer(claiming, { type: 'claimFinished', outcome: { kind: 'forbidden' } })).toMatchObject({ sheet: 'none', alert: 'wrongRole', draft: ready });
    expect(generateReducer(claiming, { type: 'claimFinished', outcome: { kind: 'missing' } })).toMatchObject({ phase: 'missing', alert: 'expired', draft: null });
    expect(generateReducer(claiming, { type: 'claimFinished', outcome: { kind: 'failed' } })).toMatchObject({ alert: 'failed', draft: ready });
    expect(generateReducer(claiming, { type: 'claimFinished', outcome: { kind: 'offline' } })).toMatchObject({ online: false, draft: ready });
    expect(generateReducer(claiming, { type: 'gateClosed' }).sheet).toBe('claiming');
  });
});
