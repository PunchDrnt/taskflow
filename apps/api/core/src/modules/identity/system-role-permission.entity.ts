import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

@Entity({ schema: 'identity', name: 'role_permissions' })
export class SystemRolePermission extends SoftDeletableEntity {
  @Column('uuid')
  roleId!: string

  @Column('uuid')
  permissionId!: string
}
