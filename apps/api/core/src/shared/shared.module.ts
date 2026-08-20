import { Global, Module } from '@nestjs/common'

import { CascadeSoftDelete } from './cascade-soft-delete'

/**
 * Global so that domain modules can inject the scoping layer without each one
 * importing it — the alternative is a line every module has to remember, and
 * forgetting it is how someone reaches for a plain Repository instead.
 */
@Global()
@Module({
  providers: [CascadeSoftDelete],
  exports: [CascadeSoftDelete],
})
export class SharedModule {}
