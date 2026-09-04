import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { Public } from '#shared/http/route-metadata'

import { AppService } from './app.service'

/** Name and version only, and nothing a session would change. */
@ApiTags('app')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Service info' })
  @ApiOkResponse({ description: 'Service identity' })
  getInfo() {
    return this.appService.getInfo()
  }
}
