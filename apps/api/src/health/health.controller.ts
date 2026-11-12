import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'API liveness and database reachability' })
  @ApiOkResponse({ type: HealthDto, description: 'API up and database reachable' })
  @ApiServiceUnavailableResponse({ type: HealthDto, description: 'Database unreachable or slower than 2 s' })
  async getHealth(): Promise<HealthDto> {
    const result = await this.health.check();
    if (result.database === 'down') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
