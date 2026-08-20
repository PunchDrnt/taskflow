import { Global, Module } from '@nestjs/common'

import { PermissionService } from './permission.service'

/** Global: every module asks the same question, none should have to import it. */
@Global()
@Module({
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
