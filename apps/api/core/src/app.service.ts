import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getInfo() {
    return { status: 'ok', service: 'core' }
  }
}
