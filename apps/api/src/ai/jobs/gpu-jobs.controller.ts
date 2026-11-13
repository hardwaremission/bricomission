import { Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { map, type Observable } from 'rxjs';
import { GpuJobBrokerService } from './gpu-job-broker.service.js';
import { GpuJobEventDto, GpuJobViewDto } from './gpu-jobs.dto.js';

@ApiTags('ai-jobs')
@ApiExtraModels(GpuJobEventDto)
@Controller('ai/jobs')
export class GpuJobsController {
  constructor(private readonly broker: GpuJobBrokerService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Current status of a GPU job' })
  @ApiOkResponse({ type: GpuJobViewDto })
  @ApiBadRequestResponse({ description: 'Malformed job id' })
  @ApiNotFoundResponse({ description: 'Unknown or expired job' })
  getJob(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): GpuJobViewDto {
    const view = this.broker.get(id);
    if (!view) throw new NotFoundException();
    return view;
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Server-sent status events of a GPU job',
    description:
      'Replays the history, then streams live events: `queued` (position updates), `running`, then one `done` or `failed`; ' +
      'the stream closes after the terminal event. SSE `id` is the per-job `seq`, `event` is the status, `data` is JSON.',
  })
  @ApiProduces('text/event-stream')
  @ApiHeader({ name: 'Last-Event-ID', required: false, description: 'Only events with seq greater than this are sent' })
  @ApiOkResponse({ description: 'Event stream', schema: { $ref: getSchemaPath(GpuJobEventDto) } })
  @ApiBadRequestResponse({ description: 'Malformed job id' })
  @ApiNotFoundResponse({ description: 'Unknown or expired job' })
  streamEvents(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    const afterSeq = lastEventId && /^\d+$/.test(lastEventId.trim()) ? Number(lastEventId.trim()) : 0;
    const events = this.broker.events(id, afterSeq);
    if (!events) throw new NotFoundException();
    return events.pipe(map((event) => ({ id: String(event.seq), type: event.status, data: event })));
  }
}
