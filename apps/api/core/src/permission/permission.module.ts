import { Global, Module } from '@nestjs/common'

import { PermissionGuard } from './permission.guard'
import { PermissionService } from './permission.service'

/**
 * Global: every module asks the same question, none should have to import it.
 *
 * `PermissionGuard` is provided and exported rather than registered as an
 * `APP_GUARD`. `@RequirePermission` attaches it to the routes that want it,
 * which is what guarantees it runs after `AuthGuard` — see the decorator.
 * Being global is what makes `UseGuards(PermissionGuard)` resolvable from a
 * controller in any module without that module importing this one.
 */
@Global()
@Module({
  providers: [PermissionService, PermissionGuard],
  exports: [PermissionService, PermissionGuard],
})
export class PermissionModule {}
