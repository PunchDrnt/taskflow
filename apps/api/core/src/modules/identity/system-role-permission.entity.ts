import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '../../shared/base.entity'

@Entity({ schema: 'identity', name: 'role_permissions' })
export class SystemRolePermission extends TimestampedEntity {
  @Column('uuid')
  roleId!: string

  @Column('uuid')
  permissionId!: string
}
