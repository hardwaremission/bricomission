import type { Measurements } from './measurements';

/** What readiness needs of a draft or claimed project. */
export interface ReadinessInput {
  measurements: Measurements;
  photos: readonly unknown[];
  moodboard: readonly unknown[];
}

/** Capture is complete: at least one photo and all three measurements. */
export function isCaptureComplete(project: ReadinessInput): boolean {
  const { lengthCm, widthCm, heightCm } = project.measurements;
  return project.photos.length >= 1 && lengthCm !== null && widthCm !== null && heightCm !== null;
}

/**
 * Ready for generation (login-gate-claim Decision 8; mirrors the API's `isReadyForGeneration`):
 * Capture complete and at least one Moodboard Item.
 */
export function isReadyForGeneration(project: ReadinessInput): boolean {
  return isCaptureComplete(project) && project.moodboard.length >= 1;
}

/** Why the costly actions are disabled; the Capture hint wins when several parts are missing. */
export function readinessHint(project: ReadinessInput): 'capture' | 'items' | null {
  if (!isCaptureComplete(project)) return 'capture';
  if (project.moodboard.length < 1) return 'items';
  return null;
}
