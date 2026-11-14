import type { KitchenMeasurements } from '@bricomission/shared-types';

/** What readiness needs of a Kitchen Project (draft or claimed). */
export interface ReadinessInput {
  measurements: KitchenMeasurements;
  photos: readonly unknown[];
  moodboard: readonly unknown[];
}

/**
 * Ready for generation (feature login-gate-claim, Decision 8): at least one photo, all three
 * measurements and at least one Moodboard Item (the Moodboard Continue rule). The web mirrors it
 * in `apps/web/src/lib/kitchen-draft/readiness.ts`; the costly endpoints answer 409
 * `project_incomplete` when it is false.
 */
export function isReadyForGeneration(project: ReadinessInput): boolean {
  const { lengthCm, widthCm, heightCm } = project.measurements;
  return project.photos.length >= 1 && lengthCm !== null && widthCm !== null && heightCm !== null && project.moodboard.length >= 1;
}
