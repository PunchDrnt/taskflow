import { describe, expect, it } from 'vitest'

import { SnakeNamingStrategy } from './snake-naming.strategy'

const strategy = new SnakeNamingStrategy()

describe('SnakeNamingStrategy', () => {
  it('derives a snake_case table name from the class name', () => {
    expect(strategy.tableName('TaskAssignment', undefined)).toBe(
      'task_assignment',
    )
  })

  it('lets an explicit @Entity name win over the derived one', () => {
    expect(strategy.tableName('TaskAssignment', 'tasks')).toBe('tasks')
  })

  it('converts the column names the base entity depends on', () => {
    expect(strategy.columnName('orgId', undefined, [])).toBe('org_id')
    expect(strategy.columnName('createdBy', undefined, [])).toBe('created_by')
    expect(strategy.columnName('parentTaskId', undefined, [])).toBe(
      'parent_task_id',
    )
    expect(strategy.columnName('deletedAt', undefined, [])).toBe('deleted_at')
  })

  it('handles an acronym that ends the property name', () => {
    expect(strategy.columnName('avatarURL', undefined, [])).toBe('avatar_url')
    expect(strategy.columnName('externalChannelID', undefined, [])).toBe(
      'external_channel_id',
    )
  })

  it('breaks on an acronym followed by a lowercase plural — name the column', () => {
    // The algorithm splits ABc into a_bc, so a trailing "IDs" reads as
    // "ID" + "s" and lands on external_channel_i_ds. Pinned here because it
    // is silent: the entity compiles and the query fails at runtime. Spell
    // such a property out with @Column({ name }) instead of pluralising it.
    expect(strategy.columnName('externalChannelIDs', undefined, [])).toBe(
      'external_channel_i_ds',
    )
  })

  it('keeps digits attached to the word they follow', () => {
    expect(strategy.columnName('oauth2Token', undefined, [])).toBe(
      'oauth2_token',
    )
  })

  it('respects an explicit @Column({ name })', () => {
    expect(strategy.columnName('orgId', 'organisation_id', [])).toBe(
      'organisation_id',
    )
  })

  it('prefixes embedded columns', () => {
    expect(strategy.columnName('city', undefined, ['billingAddress'])).toBe(
      'billing_address_city',
    )
  })
})
