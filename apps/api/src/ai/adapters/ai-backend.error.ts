/**
 * An AI backend answered with a non-2xx status or an unusable body.
 * The message never contains the backend URL or response body.
 */
export class AiBackendError extends Error {
  override readonly name = 'AiBackendError';

  constructor(readonly status: number | null) {
    super(status === null ? 'AI backend returned an unusable response' : `AI backend responded with status ${status}`);
  }
}
