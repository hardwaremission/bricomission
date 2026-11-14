/**
 * Non-secret localStorage marker: this browser had a kitchen draft, so a later 404 means it
 * expired (Capture and Moodboard show the "draft expired" notice). Never holds the token.
 */
const DRAFT_MARKER = 'bm_draft_started';

export function draftMarker(action: 'get' | 'set' | 'clear'): boolean {
  try {
    if (action === 'set') window.localStorage.setItem(DRAFT_MARKER, '1');
    if (action === 'clear') window.localStorage.removeItem(DRAFT_MARKER);
    return window.localStorage.getItem(DRAFT_MARKER) === '1';
  } catch {
    return false;
  }
}
