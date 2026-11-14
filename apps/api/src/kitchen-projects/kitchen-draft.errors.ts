import { HttpException, HttpStatus } from '@nestjs/common';
import type { KitchenDraftErrorCode } from '@bricomission/shared-types';

const MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

/** Nest-style generic error body plus a machine-readable `code` (never internals). */
export function draftError(status: HttpStatus, code: KitchenDraftErrorCode, extra: Record<string, unknown> = {}): HttpException {
  return new HttpException({ statusCode: status, message: MESSAGES[status] ?? 'Error', code, ...extra }, status);
}

export const PHOTO_ERROR_STATUS = {
  photo_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  photo_unsupported_type: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  photo_too_small: HttpStatus.UNPROCESSABLE_ENTITY,
} as const;
