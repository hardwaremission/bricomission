import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { draftError } from './kitchen-draft.errors.js';
import { PHOTO_LIMITS } from './photo-processor.js';

export const PHOTO_FIELD = 'photo';

/**
 * Parses `multipart/form-data` with exactly one file in field `photo`, kept in memory and
 * capped at 15 MB (413 `photo_too_large` as soon as the limit is crossed). Runs after the
 * DraftTokenGuard, so requests without a valid draft never have their body read.
 */
@Injectable()
export class PhotoUploadInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fields: 0, parts: 1, fileSize: PHOTO_LIMITS.maxBytes },
  }).single(PHOTO_FIELD);

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    await new Promise<void>((resolve, reject) => {
      this.upload(request, http.getResponse<Response>(), (error: unknown) => {
        if (!error) return resolve();
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return reject(draftError(HttpStatus.PAYLOAD_TOO_LARGE, 'photo_too_large'));
        }
        // Wrong field, extra parts, malformed multipart: never echo parser messages.
        return reject(new BadRequestException());
      });
    });
    if (!request.file) throw draftError(HttpStatus.BAD_REQUEST, 'photo_missing');
    return next.handle();
  }
}
