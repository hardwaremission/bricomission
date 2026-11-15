/** Helpers to show an event payload (already redacted by the API). Pure. */

export interface Thumb {
  dataUri: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes?: number;
}

const JPEG_DATA_URI = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only the API's own thumbnail objects (base64 JPEG, at most 96 px) are ever put in an `<img>`. */
export function asThumb(value: unknown): Thumb | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'thumbnail' || typeof v.dataUri !== 'string' || !JPEG_DATA_URI.test(v.dataUri)) return null;
  if (typeof v.width !== 'number' || typeof v.height !== 'number' || v.width > 96 || v.height > 96) return null;
  return {
    dataUri: v.dataUri,
    width: v.width,
    height: v.height,
    bytes: typeof v.bytes === 'number' ? v.bytes : 0,
    originalBytes: typeof v.originalBytes === 'number' ? v.originalBytes : undefined,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Text put on the clipboard: the payload as JSON with thumbnails replaced by their size (never image data). */
export function copyText(payload: unknown): string {
  return JSON.stringify(
    payload,
    (_key, value: unknown) => {
      const thumb = asThumb(value);
      return thumb ? `[thumbnail ${thumb.width}x${thumb.height}, ${formatBytes(thumb.originalBytes ?? thumb.bytes)}]` : value;
    },
    2,
  );
}

export function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** Label of a payload key as a block heading: `negativePrompt` to `NEGATIVE PROMPT`. */
export function headingOf(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toUpperCase();
}

/** One-line facts of the toolbar (L2): tokens, schema, limits. Only keys that exist are shown. */
export function toolbarFacts(payload: Record<string, unknown>): string {
  const facts: string[] = [];
  const num = (key: string, label: string): void => {
    const value = payload[key];
    if (typeof value === 'number') facts.push(`${value.toLocaleString('en-US')} ${label}`);
  };
  num('promptTokens', 'prompt tokens');
  num('completionTokens', 'completion tokens');
  if (typeof payload.tokensPerSecond === 'number') facts.push(`${payload.tokensPerSecond.toFixed(1)} tok/s`);
  if (typeof payload.schema === 'string') facts.push(`schema ${payload.schema}`);
  if (typeof payload.maxTokens === 'number') facts.push(`maxTokens ${payload.maxTokens}`);
  if (typeof payload.model === 'string') facts.push(`model ${payload.model}`);
  return facts.join(' · ');
}
