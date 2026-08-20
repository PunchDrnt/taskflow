import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus'

import { StorageService } from '../modules/storage/storage.service'

const HEAP_LIMIT_BYTES = 512 * 1024 * 1024
const RSS_LIMIT_BYTES = 1024 * 1024 * 1024

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
    private readonly storage: StorageService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  // Attachments are unreadable without MinIO, so an instance that cannot reach
  // it is not ready — but the process is fine, so this never goes in live().
  private async storageCheck() {
    const indicator = this.indicators.check('storage')
    return (await this.storage.isReachable())
      ? indicator.up()
      : indicator.down({ message: 'MinIO is unreachable' })
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check' })
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', HEAP_LIMIT_BYTES),
      () => this.memory.checkRSS('memory_rss', RSS_LIMIT_BYTES),
      () => this.db.pingCheck('database'),
      () => this.storageCheck(),
    ])
  }

  // Liveness answers "is the process running?" — it must not check dependencies,
  // or a transient database blip would get the container restarted.
  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return this.health.check([])
  }

  // Readiness answers "can this instance serve traffic?" — add dependency
  // indicators (database, cache, upstream APIs) to this list as you add them.
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  ready() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', HEAP_LIMIT_BYTES),
      // A database this instance cannot reach means it cannot serve traffic.
      // It belongs here and never in `live()` — a transient blip should pull
      // the instance out of the load balancer, not restart the container.
      () => this.db.pingCheck('database'),
      () => this.storageCheck(),
    ])
  }
}
