import { Global, Module } from '@nestjs/common'

import { FeatureService } from './feature.service'

@Global()
@Module({
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}
