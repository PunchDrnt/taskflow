import { Column, Entity } from 'typeorm'

import { CreatedEntity } from '#shared/entity/base.entity'

@Entity({ schema: 'identity', name: 'role_permissions' })
export class SystemRolePermission extends CreatedEntity {
  @Column('uuid')
  roleId!: string

  @Column('uuid')
  permissionId!: string
}
