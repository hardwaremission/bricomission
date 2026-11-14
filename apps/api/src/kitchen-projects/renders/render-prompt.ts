/**
 * Moodboard to prompt (feature controlnet-render, OQ-2/OQ-3). Pure: no I/O.
 *
 * - Dominant style: the `styleId` that occurs most among the Moodboard's gallery items; a tie
 *   goes to the style whose first item has the lowest position.
 * - Style text: the internal manifest prompt of the Moodboard's first gallery item of that
 *   style, cut where the shared suffix ", interior design photography" starts.
 * - Upload items never change the prompt (no IP-Adapter weights). An uploads-only Moodboard uses
 *   the `modern-01` text and `styleId: null`.
 */

/** Gallery lookups the prompt needs: the style of an image and its internal prompt. */
export interface RenderPromptGallery {
  find(id: string): { styleId: string } | null;
  promptFor(id: string): string | null;
}

export interface RenderPromptItem {
  position: number;
  source: 'gallery' | 'upload';
  galleryImageId: string | null;
}

export interface RenderPrompt {
  styleId: string | null;
  positive: string;
  negative: string;
}

/** Neutral style for a Moodboard without gallery picks. */
export const FALLBACK_GALLERY_IMAGE = 'modern-01';
const SHARED_SUFFIX = ', interior design photography';
/**
 * Tuned 2026-11-15 (developer feedback: no clutter, no structural changes). ComfyUI weights use
 * `(text:weight)`. The constraints come first so they always land in the first 75-token CLIP
 * chunk (prefix 32 tokens; style text 30-42; suffix 10: longer positives spill into a second
 * chunk, which ComfyUI encodes and concatenates). The negative is 72 tokens: one chunk.
 */
export const RENDER_POSITIVE_PREFIX =
  'photorealistic renovated kitchen, (clean empty countertops:1.3), (nothing on the counters:1.2), every cabinet stays a cabinet in the same position, same walls, doors and windows, ';
export const RENDER_POSITIVE_SUFFIX = ', interior design photography, natural daylight, sharp focus';
/** Clutter and structural hallucinations (new doors, openings, windows) plus the spike's quality terms. */
export const RENDER_NEGATIVE_PROMPT =
  '(kettle:1.3), (dish rack:1.3), dish drainer, plastic tub, bowls, extra sink, extra faucet, bottles, utensils, dishes, small appliances, (clutter:1.3), (doorway:1.3), (glass door:1.3), extra door, archway, wall opening, new window, removed wall, structural change, blurry, cartoon, distorted perspective, warped walls, people, text, watermark';
const NEUTRAL_STYLE_TEXT = 'modern kitchen';

export function styleText(manifestPrompt: string): string {
  const cut = manifestPrompt.indexOf(SHARED_SUFFIX);
  return (cut >= 0 ? manifestPrompt.slice(0, cut) : manifestPrompt).trim();
}

export function buildRenderPrompt(moodboard: readonly RenderPromptItem[], gallery: RenderPromptGallery): RenderPrompt {
  const picks = [...moodboard]
    .sort((a, b) => a.position - b.position)
    .flatMap((item) => {
      if (item.source !== 'gallery' || item.galleryImageId === null) return [];
      const image = gallery.find(item.galleryImageId);
      return image ? [{ imageId: item.galleryImageId, styleId: image.styleId }] : [];
    });

  let styleId: string | null = null;
  let imageId = FALLBACK_GALLERY_IMAGE;
  if (picks.length > 0) {
    const counts = new Map<string, number>();
    for (const pick of picks) counts.set(pick.styleId, (counts.get(pick.styleId) ?? 0) + 1);
    // Map keeps first-seen order (= lowest position first), so `>` keeps the earliest on a tie.
    let best = -1;
    for (const [candidate, count] of counts) {
      if (count > best) {
        best = count;
        styleId = candidate;
      }
    }
    imageId = picks.find((pick) => pick.styleId === styleId)?.imageId ?? FALLBACK_GALLERY_IMAGE;
  }
  const manifestPrompt = gallery.promptFor(imageId);
  const text = manifestPrompt ? styleText(manifestPrompt) : NEUTRAL_STYLE_TEXT;
  return { styleId, positive: `${RENDER_POSITIVE_PREFIX}${text || NEUTRAL_STYLE_TEXT}${RENDER_POSITIVE_SUFFIX}`, negative: RENDER_NEGATIVE_PROMPT };
}
