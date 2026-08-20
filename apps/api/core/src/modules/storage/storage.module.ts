import { Global, Module } from '@nestjs/common'

import { StorageService } from './storage.service'

/** Global: several modules attach files, none of them owns storage. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
