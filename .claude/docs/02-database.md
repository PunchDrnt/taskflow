# Database

ทุกตารางในระบบ พร้อมฟิลด์ · กติกา FK · การแยกข้อมูลตาม org

> [← Overview](./00-overview.md) · เกี่ยวข้อง: [`01-architecture.md`](./01-architecture.md)

## Contents

1. [Schema Map](#1-schema-map) — ตารางไหนอยู่ schema ไหน
2. [Foreign Key Rules](#2-foreign-key-rules) — ทิศทางเดียว, polymorphic
3. [Multi-tenancy](#3-multi-tenancy) 🔒
4. [Other Notes](#4-other-notes) — migration, DB user, connection pool, [CHECK vs enum](#check-vs-enum)
5. [Full Schema](#5-full-schema) ← ดูฟิลด์ทุกตารางที่นี่

---

## 1. Schema Map

| Schema         | ตาราง                                                                                    | Module          |
| -------------- | ---------------------------------------------------------------------------------------- | --------------- |
| `identity`     | users, sessions, password_reset_tokens, roles, permissions, role_permissions, user_roles · oauth_accounts _(ยังไม่สร้าง)_ | `identity/`     |
| `organization` | organizations, members, teams, team_members                                              | `organization/` |
| `project`      | projects, members, statuses, sprints                                                     | `project/`      |
| `task`         | tasks, assignees                                                                         | `task/`         |
| `audit`        | logs                                                                                     | `audit/`        |
| `discussion`   | comments, attachments _(Phase 3)_                                                        | `discussion/`   |
| `field`        | definitions _(Phase 4)_                                                                  | `field/`        |
| `view`         | views, columns _(Phase 4)_                                                               | `view/`         |
| `chat`         | identities, channels _(Phase 2)_                                                         | `chat/`         |
| `notify`       | outbox                                                                                   | `notify/`       |
| `billing`      | plans, subscriptions, ai_wallet, ai_usage _(ตารางว่าง เผื่ออนาคต)_                          | —               |
| `public`       | extension + `migrations` (สมุดบันทึกของ TypeORM CLI) เท่านั้น — ห้ามมีตารางของ module            | —               |

**หลักการตั้งชื่อ**

- Schema ตั้งตาม domain · **ไม่ย่อ** · เอกพจน์
- ชื่อตารางไม่ซ้ำคำกับ schema — `chat.identities` ไม่ใช่ `chat.chat_identities`
- ข้อยกเว้นเดียวที่ย่อคือ **คอลัมน์ `org_id`** เพราะโผล่ในทุกตาราง ทุก query ทุก index

TypeORM กำหนดที่ entity: `@Entity({ schema: 'task', name: 'tasks' })`

## 2. Foreign Key Rules

> 🔒 **ต้องทำ** — ตารางที่มี `org_id` **และ** มี FK ไปตารางที่ scope ด้วย org เหมือนกัน → FK นั้นต้องเป็น **composite `(fk_id, org_id)`**

```sql
-- ตารางแม่: id เป็น PK อยู่แล้วจึง unique อยู่ดี · index นี้มีไว้ให้ลูกชี้เท่านั้น
ALTER TABLE organization.teams ADD CONSTRAINT teams_id_org_unique UNIQUE (id, org_id);

-- ตารางลูก: ชี้เป็นคู่ ไม่ใช่ชี้ทีละคอลัมน์
FOREIGN KEY (team_id, org_id) REFERENCES organization.teams (id, org_id) ON DELETE CASCADE
```

**ทำไมถึงเป็น 🔒** — `org_id` ที่ลูกถือเป็นค่า denormalize ถ้าไม่มีอะไรผูก มันขัดกับแม่ได้ แล้ว `OrgScopedRepository` ที่กรองด้วย `org_id` อย่างเดียวจะคืนแถวนั้นออกมา = **ข้อมูลข้าม org รั่ว จากคอลัมน์ที่มีไว้กันรั่วเอง**

```
team_members.org_id = Org A     แต่     teams.org_id = Org B
ไม่มี composite FK →  INSERT ผ่าน · repository ของ Org A เห็นแถวนี้     (ทดสอบแล้ว)
มี composite FK    →  INSERT ถูกปฏิเสธ                                 (ทดสอบแล้ว)
```

ผลข้างเคียงที่ตั้งใจ: **ย้าย team/project ข้าม org ทั้งที่ยังมีลูกอยู่ไม่ได้** ต้องย้ายลูกไปพร้อมกันใน transaction เดียว

**ไม่ต้องทำ composite** ถ้า FK ชี้ตรงไป `organization.organizations(id)` (เช่น `teams.org_id`, `projects.org_id`) เพราะคอลัมน์เดียวขัดกับตัวเองไม่ได้ · และถ้าชี้ไป schema `identity` ซึ่งไม่มี org

- FK ข้าม schema ได้ **ทิศทางเดียว**: `task → project → organization → identity`
- Schema ระดับล่างห้ามมี FK ชี้ขึ้นไปหาระดับบน — `identity` ต้องไม่รู้จัก `task`
- Schema กลาง (`audit`, `discussion`, `field`, `view`) ไม่ชี้ไปไหนเลย (polymorphic)
- ตาราง polymorphic (`discussion.comments`, `discussion.attachments`, `audit.logs`, `field.definitions`) **ไม่มี FK** — ชดเชยด้วย index

```sql
CREATE INDEX ON discussion.comments (org_id, entity_type, entity_id, created_at);
```

### ON DELETE

> ⚠️ FK cascade ทำงานกับ **hard delete เท่านั้น** — ระบบใช้ soft delete เป็นหลัก
> การลบแบบ cascade ตอนทำงานปกติ **ต้องเขียนใน service เอง**
> FK เหล่านี้เป็นตาข่ายนิรภัยตอน hard delete (cleanup job, ลบ org ทิ้ง)

| FK                                                                                          | Action                    |
| ------------------------------------------------------------------------------------------- | ------------------------- |
| `project.statuses.project_id` · `project.members.project_id` · `project.sprints.project_id` | `CASCADE`                 |
| `chat.channels.project_id` · `field.definitions.project_id` · `view.views.project_id`       | `CASCADE`                 |
| `task.assignees.task_id` · `task.tasks.parent_task_id`                                      | `CASCADE`                 |
| `organization.members.org_id` · `organization.team_members.team_id`                         | `CASCADE`                 |
| `identity.sessions.user_id` · `password_reset_tokens.user_id`                               | `CASCADE`                 |
| `identity.role_permissions.*` · `user_roles.role_id`                                        | `CASCADE`                 |
| `task.tasks.sprint_id`                                                                      | `SET NULL` (ตกไป Backlog) |
| `chat.channels.default_assignee_id` · `identity.user_roles.granted_by`                      | `SET NULL`                |
| `task.tasks.project_id` · `task.tasks.status_id`                                            | `RESTRICT`                |
| `organization.members.user_id` · `team_members.user_id`                                     | `RESTRICT`                |
| `*.created_by` · `*.updated_by` · `task.tasks.completed_by`                                 | `RESTRICT`                |

**`created_by` เป็น `RESTRICT` ไม่ใช่ `SET NULL`** — เพราะการลบ user คือ _anonymize_ (แถวยังอยู่) ไม่ใช่ hard delete FK จึงยังชี้ได้ ประวัติไม่พัง และคง `NOT NULL` ได้

**`SET NULL` ใช้ได้เฉพาะ column ที่ nullable** — ถ้า `NOT NULL` จะ error ตอน runtime ไม่ใช่ตอนสร้าง table

**`audit.logs` ไม่มี FK และห้ามลบเด็ดขาด** แม้ entity แม่หายไป

## 3. Multi-tenancy

> 🔒 **ต้องทำ** — `org_id` ทุกตาราง ทุก schema ยกเว้น `identity` ทั้งก้อน

- `org_id` **ทุกตาราง ทุก schema** รวมถึงตารางกลาง (ข้อยกเว้น 3 ข้อด้านล่าง)
- Composite index ขึ้นต้นด้วย `org_id` เสมอ
  ```sql
  CREATE INDEX ON task.tasks (org_id, project_id, status_id);
  ```
- บังคับกรองผ่าน Guard/Interceptor ระดับ global ไม่ให้ dev จำเอง
- **Row-Level Security เปิดทุกตาราง — ทำใน Phase 2 ไม่ใช่ Phase 0** (`CREATE POLICY` เป็นงาน additive เพิ่มทีหลังได้โดยไม่ต้อง migrate) · Phase 0 ใช้ repository base class + isolation test · ดูเหตุผลเต็มใน [`01-architecture.md`](./01-architecture.md#org_id-scoping)
  - ⚠️ ต้องมี `FORCE ROW LEVEL SECURITY` ด้วย ไม่งั้น policy ไม่กันเจ้าของตารางและจะเงียบสนิทไม่มี error
  - ⚠️ ใช้ `set_config('app.current_org_id', $1, true)` ไม่ใช่ `SET LOCAL` (SET LOCAL รับ parameter ไม่ได้ → เสี่ยง SQL injection)

> ⚠️ พลาดครั้งเดียวตอนเป็น SaaS จริง = ข้อมูลข้ามบริษัทรั่ว — จุดนี้ต้องมี test

## 4. Other Notes

- Migration แยกไฟล์ตาม module ตั้งชื่อมี prefix module
- แยก DB user ตาม schema — อย่างน้อย**ห้ามใช้ superuser รัน app**
- อย่าแยกเป็นคนละ database (จะเสีย transaction ข้าม module)
- Connection pool ตัวเดียวพอ

### CHECK vs enum

**ไม่ใช้ `enum` type ของ Postgres ที่ไหนเลย** — เพิ่มค่าใหม่ต้องแยก migration สองรอบ (ค่าที่เพิ่งเพิ่มใช้ใน transaction เดียวกันไม่ได้) ลบค่าต้องสร้าง type ใหม่ทั้งตัว · ใช้ `text` ธรรมดา แล้วใส่ `CHECK` เอาถ้าจำเป็น — แก้ทีหลังแค่ drop constraint แล้ว add ใหม่

ใส่ `CHECK` เฉพาะคอลัมน์ที่**มี partial index พึ่งค่ามันอยู่** เพราะค่าที่พิมพ์ผิดจะหลุดจาก index ไปเงียบ ๆ — insert ผ่าน ไม่มี error แต่ข้อจำกัดที่ตั้งใจไว้หายไป ตอนนี้มี 3 ตัว:

| คอลัมน์ | index ที่พึ่งมัน |
| --- | --- |
| `identity.users.status` | unique email `WHERE status != 'deleted'` |
| `project.sprints.status` | unique `(project_id) WHERE status = 'active'` |
| `notify.outbox.status` | คิวของ worker `WHERE status = 'pending'` |

คอลัมน์ค่าจำกัดตัวอื่น (`role`, `priority`, `platform`, `assignee_type`, `type` ฯลฯ) ปล่อยเป็น `text` ให้ application คุม — เพิ่ม `CHECK` ทีหลังได้ตลอดถ้าเจอปัญหาจริง

หัวข้อนี้พูดถึง `CHECK` ที่จำกัด**ชุดค่า**ของคอลัมน์เดียวเท่านั้น · `CHECK` ที่ผูกสองคอลัมน์เข้าด้วยกัน (invariant ข้ามคอลัมน์ เช่น `identity.users` ที่บังคับ `password_hash IS NULL` เมื่อ `is_system`) เป็นคนละเรื่อง ใส่ได้ตามที่จำเป็น ไม่ต้องเข้าเกณฑ์ข้างบน

**ห้ามใส่** `CHECK` กับคอลัมน์ที่ค่าโตตามฟีเจอร์ — `audit.logs.entity_type` / `audit.logs.action` / `discussion.comments.entity_type` / `notify.outbox.template` / `view.columns.column_key` · ทุกฟีเจอร์ใหม่จะกลายเป็น migration แถม และ `audit.logs` เป็นตาราง partition ที่ไม่เคยลบ → `VALIDATE` แพงขึ้นเรื่อย ๆ

> ⚠️ `CHECK` ใน DB กับ union type ใน `@repo/shared` ไม่มีอะไร sync ให้ — แก้ที่ไหนต้องแก้อีกที่ด้วย

---

## 5. Full Schema

ทุกตารางในระบบ · ฟิลด์ที่มี _(Phase N)_ คือสร้างตั้งแต่ Phase 0 แต่เริ่มใช้ตอน Phase นั้น

### Base Entity — On Every Table, With Four Named Exceptions

> 🔒 **ต้องทำ** — primary key เป็น UUID · วันเวลาเป็น `timestamptz` ทั้งหมด

```
id           uuid          PK · gen_random_uuid()
org_id       uuid          NOT NULL · ทุกตาราง ทุก schema

created_at   timestamptz   NOT NULL · default now()
created_by   uuid          NOT NULL · ผู้สร้าง (ระบบสร้างเอง = uuid ของ system user)
updated_at   timestamptz   NOT NULL · default now() · อัปเดตทุกครั้งที่แก้
updated_by   uuid          NOT NULL · คนที่แก้ล่าสุด
deleted_at   timestamptz   null = ยังไม่ถูกลบ (soft delete)
deleted_by   uuid          null · คนที่ลบ

CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))   -- ตั้งพร้อมกันเสมอ
```

**`deleted_at` กับ `deleted_by` ต้องตั้งพร้อมกัน** — แถวที่ถูกลบแล้วไม่รู้ว่าใครลบคือประวัติที่กู้ไม่ได้ · TypeORM ตั้ง `deleted_at` ให้เองผ่าน `@DeleteDateColumn` แต่ `deleted_by` ต้องตั้งเองผ่าน subscriber · CHECK นี้กันกรณีที่ subscriber ไม่ทำงาน

**ข้อยกเว้น 4 กลุ่ม**

| ตาราง                                                 | ไม่มี                      | เพราะ                                                                 |
| ----------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `audit.logs`                                          | base entity ทั้งชุด          | composite PK · `occurred_at`/`actor_id` ทำหน้าที่แทน `created_at`/`created_by` |
| `organization.organizations`                          | `org_id`                  | เท่ากับ `id` เสมอ                                                        |
| `identity.sessions` · `identity.password_reset_tokens` · `notify.outbox` | `deleted_at`/`deleted_by` | มี `revoked_at` / `used_at` / `status` อยู่แล้ว และนโยบายคือ hard delete       |
| **ตารางความสัมพันธ์** — `organization.members` · `organization.team_members` · `project.members` · `task.assignees` · `identity.role_permissions` · `identity.user_roles` · และ `billing.ai_usage` | `deleted_at`/`deleted_by` | ดูด้านล่าง |

กลุ่มที่สามคือบั๊กแบบเดียวกับที่ `identity.users` เคยมี — **ตัวบอกการลบสองตัวในตารางเดียวย่อมขัดกันได้**

**กลุ่มที่สี่ — ตารางความสัมพันธ์เป็น hard delete** เดิมเป็น soft delete เพราะเป็น default ของ `BaseEntity` ไม่ใช่เพราะถูกถามทีละตาราง · เหตุผลที่เปลี่ยน เรียงจากหนักสุด

1. **ลืม filter บนตารางพวกนี้ = ช่องโหว่สิทธิ์ ไม่ใช่บั๊กการแสดงผล** · แถว `project.members` ที่ `deleted_at` มีค่าแต่ query ลืมกรอง = คนที่ถูกถอดออกยังเข้าถึง project ได้ · hard delete แล้วแถวไม่อยู่ ไม่มีอะไรให้ลืม
2. **เหตุผลที่คนเก็บ soft delete ไว้ ที่นี่มีของที่ดีกว่าอยู่แล้ว** — `audit.logs` partition รายเดือน ไม่เคยลบ (🔒) บันทึกว่าใครถอดใครออกเมื่อไหร่ครบกว่า `deleted_by` ตัวเดียว
3. **ถอดคนออกไม่ใช่การทำลายข้อมูล** มันคือการเปลี่ยนความสัมพันธ์ เพิ่มกลับต้นทุนศูนย์ ไม่มีอะไรให้กู้ · soft delete ทำให้ถอด-ใส่ซ้ำสะสมแถวตาย และ upsert ต้องคิดเผื่อทุกครั้ง
4. `billing.ai_usage` เป็นบันทึกการใช้เงิน — append-only ให้ retention ลบจริง soft delete ไม่ตรงความหมาย

**cascade ไม่ลงไปหาตารางกลุ่มนี้** โดยตั้งใจ — soft delete project แล้ว member ยังอยู่ครบ **restore แล้วได้คนเดิมกลับมา** · ตอน hard delete จริงตอน retention `ON DELETE CASCADE` ของ FK เก็บกวาดให้เอง

**ในกลุ่มที่สี่ สามตารางไม่มี `updated_at`/`updated_by` ด้วย** — `identity.role_permissions` · `identity.user_roles` · `task.assignees` เพราะไม่มีคอลัมน์ไหนถูก "แก้" หลังสร้างเลย มีแต่ FK สองสามตัวที่เป็น**สิทธิ์**ตัวมันเอง (สิทธิ์นี้ผูกกับ role นี้ไหม, task นี้มอบให้คนนี้ไหม) ถอนแล้วให้ใหม่คือลบแถวสร้างใหม่ ไม่ใช่ UPDATE · ถ้าเก็บสองคอลัมน์นี้ไว้ ค่าจะเท่ากับ `created_at`/`created_by` ตลอดไป พร้อมแบก FK `ON DELETE RESTRICT` ที่ไม่เคยได้ใช้

`organization.members` · `organization.team_members` · `project.members` · `billing.ai_usage` ยังมี `updated_at`/`updated_by` เหมือนเดิม — สามตัวแรกมีคอลัมน์ `role` ที่เปลี่ยนได้จริง (เลื่อนขั้น/ลดขั้น) ส่วน `ai_usage` ยังไม่ commit เป็น spec (§Phase 7-8) จึงไม่ตัดสินล่วงหน้าว่า token นับสะสมด้วย UPDATE หรือ insert ใหม่ทุกครั้ง

> ⚠️ **ทุก field ที่เป็นวันเวลาใช้ `timestamptz` (timestamp with time zone) เท่านั้น**
>
> ห้ามใช้ `timestamp` (without time zone) เด็ดขาด — เก็บเป็น UTC ใน DB แล้วแปลงเป็น timezone ผู้ใช้ที่ frontend
>
> ยกเว้นฟิลด์ที่เป็น**วันที่ล้วนไม่มีเวลา** เช่น `sprints.start_date` / `end_date` ใช้ `date` ได้

**TypeORM implementation**

```ts
// shared/base.entity.ts
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column('uuid') orgId: string

  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date
  @Column('uuid') createdBy: string
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date
  @Column('uuid') updatedBy: string
  @DeleteDateColumn({ type: 'timestamptz' }) deletedAt: Date | null
  @Column('uuid', { nullable: true }) deletedBy: string | null
}
```

- `@DeleteDateColumn` ทำให้ TypeORM กรอง `deleted_at IS NULL` ให้อัตโนมัติทุก query — ถ้าต้องการดูของที่ลบแล้วใช้ `withDeleted: true`
- `createdBy` / `updatedBy` / `deletedBy` เติมอัตโนมัติจาก request context ผ่าน TypeORM subscriber ไม่ต้อง set เองทุกที่
- `org_id` เติมและกรองอัตโนมัติผ่าน global interceptor เช่นกัน

### The `org_id` Rule — Tied to the Schema

> **ทุกตารางต้องมี `org_id` · ยกเว้น schema `identity` ทั้งก้อน**

`identity` ไม่มี `org_id` เพราะ:

| ตาราง                                                    | เหตุผล                                          |
| -------------------------------------------------------- | ---------------------------------------------- |
| `users`                                                  | 1 user อยู่ได้หลาย org ผ่าน `organization.members` |
| `sessions`, `password_reset_tokens`                      | ผูกกับ user ไม่ใช่ org                             |
| `roles`, `permissions`, `role_permissions`, `user_roles` | สิทธิ์ระดับทั้งเว็บ อยู่**เหนือ** org                    |

> **ข้อยกเว้นที่สอง: `billing.plans`** — เป็นแค็ตตาล็อกราคาระดับทั้งระบบ ไม่ได้เป็นของ org ใด จึงไม่มี `org_id`
> ส่วน `billing.subscriptions`, `ai_wallet`, `ai_usage` มี `org_id` ตามปกติ

> **ข้อยกเว้นที่สาม: `organization.organizations`** — `org_id` ของมันจะเท่ากับ `id` ตัวเองเสมอ เก็บไว้ก็คือเก็บค่าเดิมสองที่ทุกแถว
>
> `OrgScopedRepository` จึง scope ตารางนี้ด้วย `id` แทน — เป็นเคสพิเศษ **หนึ่งจุดที่ตั้งใจ** ในโค้ดที่เดียว ไม่ใช่คอลัมน์ซ้ำที่ทุกแถวต้องแบก

ด้านล่างจะไม่เขียนฟิลด์ base ซ้ำ แสดงเฉพาะฟิลด์เฉพาะของแต่ละตาราง

### Schema `identity`

```
users
  email                       citext   unique (partial — ดูด้านล่าง)
  password_hash               text     null · NULL = login ด้วยรหัสผ่านไม่ได้ (system user · เผื่อ OAuth ทีหลัง)
  name                        text
  nickname                    text     คนไทยเรียกชื่อเล่น — ต้องค้นได้
  avatar_url                  text     null
  status                      text     'active' | 'deactivated' | 'pending_deletion' | 'deleted'
  deletion_requested_at       timestamptz null · วันที่เจ้าตัวกดลบบัญชี — ตัวนับ 30 วันของ grace period
  is_system                   boolean  default false · true ได้แถวเดียวทั้งตาราง — ดูด้านล่าง
  has_claimed_free_credits    boolean  default false  (SaaS — ไม่ reset แม้ org ถูกลบ)
  free_org_count              int      default 0      (SaaS)

  -- users ไม่มี org_id (1 user อยู่ได้หลาย org ผ่าน organization.members)
  -- citext เป็น case-insensitive อยู่แล้ว จึงไม่ต้องพันด้วย lower() ซ้ำ
  CHECK (status IN ('active', 'deactivated', 'pending_deletion', 'deleted'))
  CHECK (NOT is_system OR password_hash IS NULL)
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
  CHECK ((status = 'pending_deletion') = (deletion_requested_at IS NOT NULL))
  CREATE UNIQUE INDEX ON identity.users (email) WHERE status != 'deleted';
  CREATE UNIQUE INDEX ON identity.users (is_system) WHERE is_system;
```

**ทำไมต้องมี `deletion_requested_at` ทั้งที่มี `deleted_at` อยู่แล้ว**

สองคอลัมน์นี้อยู่คนละปลายของช่วง 30 วัน — `deletion_requested_at` คือวันที่กดลบ ส่วน `deleted_at` คือวันที่ anonymize เสร็จ (CHECK ผูกไว้กับ `status = 'deleted'` อยู่แล้ว) · retention job ต้องนับจากอันแรก

ใช้ `deleted_at` แทนไม่ได้เพราะมันเป็น `@DeleteDateColumn` — TypeORM กรอง `deleted_at IS NULL` ให้อัตโนมัติทุก query ถ้าเซ็ตตั้งแต่วันกดลบ user จะหายจากระบบทันที ทั้งที่ 30 วันนั้นคือช่วงที่ต้องหาเจอพอดี (login กลับมาปลดล็อก, สมัครใหม่ด้วยอีเมลเดิมแล้วต้องขึ้นว่ารอลบอยู่, ชื่อยังต้องโชว์บนงานเก่า)

CHECK เป็น biconditional เหมือนคู่ `deleted_at`/`deleted_by` — ล้างค่าพร้อมกับตอนเปลี่ยน status ไม่ว่าจะไปทาง `active` (กู้คืน) หรือ `deleted` (ครบกำหนด) · ค่าค้างบนบัญชีที่กู้คืนแล้วแปลว่า job จะ anonymize คนที่กลับมาแล้ว

**System user** — `id` คงที่ `00000000-0000-0000-0000-000000000000`

`created_by` เป็น `NOT NULL` ทุกตาราง แต่มีแถวที่ระบบสร้างเองจริง ๆ (migration ที่ seed status เริ่มต้น, outbox worker, cron สร้าง partition) จึงต้องมี "คน" ให้ชี้ · แถวแรกของ `identity.users` ชี้ `created_by` มาที่ตัวเอง — Postgres ทำได้ใน `INSERT` เดียวถ้าใส่ `id` เป็นค่าคงที่ ไม่ต้อง `DEFERRABLE` ไม่ต้องแยกสองคำสั่ง

ล็อกไว้ที่ schema ไม่ใช่ที่วินัย:

| กัน                            | ด้วย                                              |
| ----------------------------- | ------------------------------------------------ |
| login เข้ามาเป็น system user     | `password_hash IS NULL` + CHECK บังคับ            |
| มี system user มากกว่าหนึ่ง       | partial unique index บน `is_system`               |
| ลบ system user ทิ้ง              | trigger `BEFORE DELETE ... WHEN (OLD.is_system)`  |
| โผล่ในรายชื่อสมาชิก / assignee picker | กรอง `is_system = false` — เป็นคอลัมน์จริง grep เจอ |

> ⚠️ `ON DELETE RESTRICT` **กัน system user ไม่ได้** — แถวนี้อ้างถึงตัวเองเป็นรายเดียว พอลบ ตัวที่อ้างก็หายไปพร้อมกัน Postgres จึงยอมให้ลบ (ลองแล้ว `DELETE 1` ผ่านฉลุย) · FK จากตารางอื่นจะช่วยได้ก็ต่อเมื่อตารางนั้นมีแถวที่ระบบสร้างแล้วเท่านั้น จึงต้องมี trigger กันไว้ตรง ๆ

**`deleted_at` กับ `status` ต้องตรงกันเสมอ** — `identity.users` มีตัวบอกการลบสองตัว (base entity ให้ `deleted_at` มา ส่วน lifecycle จริงของ user เดินด้วย `status` ตาม [User States](./04-features.md#user-states--three-different-things)) · CHECK ผูกไว้ให้ขัดกันไม่ได้ ถ้าปล่อยไว้จะมีแถวที่ `deleted_at` ตั้งแล้วแต่ `status` ยังเป็น `active` แล้วอีเมลนั้นจะถูกจองค้างตลอดไป

```
sessions                                 -- 1 แถว = 1 การ login จาก 1 เครื่อง
  user_id                uuid  FK
  current_token_hash     text          hash ของ refresh token ที่ใช้ได้ตอนนี้
  previous_token_hash    text  null    อันก่อนหน้า — ใช้ทำ grace window + จับ token reuse
  rotated_at             timestamptz null  ใช้คำนวณ grace window 10 วินาที
  user_agent             text
  ip_address             inet
  last_used_at           timestamptz   -- ❓ ยังไม่ตัดสินว่าเขียนตอนไหน · เขียนทุก
                                       -- request = 1 write/request ไม่ใช่ 1 ต่อ 15
                                       -- นาที · ทางเลือก lazy (เกิน N นาทีค่อยเขียน)
  expires_at             timestamptz   +15 วัน
  revoked_at             timestamptz null
  revoked_reason         text  null    'logout' | 'logout_all' | 'password_change'
                                       | 'password_reset' | 'token_reuse' | 'admin'

  CREATE INDEX ON identity.sessions (current_token_hash) WHERE revoked_at IS NULL;
  CREATE INDEX ON identity.sessions (user_id, revoked_at);

  -- rotation ไม่สร้างแถวใหม่ — แถวเดียวอยู่ตลอด 15 วัน แค่เปลี่ยน token hash
  -- 1 session มี refresh token ที่ใช้ได้ 1 อันเสมอ

password_reset_tokens
  user_id             uuid  FK
  token_hash          text          hash ไม่เก็บ plain
  expires_at          timestamptz   +10 นาที
  used_at             timestamptz null   ใช้ได้ครั้งเดียว
  CREATE INDEX ON identity.password_reset_tokens (token_hash) WHERE used_at IS NULL;

oauth_accounts        ⚠ ยังไม่สร้าง — migrate ใน Phase 1 แต่ Google login ยังไม่เปิดใช้
                      -- 1 แถว = 1 provider ที่ user คนนั้นผูกไว้
  user_id             uuid  FK → identity.users · ON DELETE CASCADE
  provider            text        'google' (เผื่อ 'line' ทีหลัง)
  provider_user_id    text        `sub` ที่ provider ให้มา — ไม่ใช่อีเมล เพราะอีเมลเปลี่ยนได้
  provider_email      text        อีเมลฝั่ง provider ตอน link · ไว้สืบย้อน ไม่ใช่ตัวจับคู่

  CHECK (provider IN ('google'))
  -- กัน Google account เดียวถูกอ้างโดยสอง user — ถ้าไม่มี คือช่องยึดบัญชี
  CREATE UNIQUE INDEX ON identity.oauth_accounts (provider, provider_user_id)
    WHERE deleted_at IS NULL;
  -- 1 คน ผูก provider ละบัญชีเดียว · ผ่อนทีหลังแค่ drop index
  CREATE UNIQUE INDEX ON identity.oauth_accounts (user_id, provider)
    WHERE deleted_at IS NULL;
```

**ตารางนี้ยังไม่มีในฐานข้อมูล — Phase 1 migrate แต่ยังไม่เปิดใช้** เป็นแพทเทิร์นเดียวกับ `identity.roles` / `permissions` / `role_permissions` / `user_roles` ที่ลงตั้งแต่ Phase 0 แล้วไม่มีใครอ่านจนถึง Phase 7 · schema ข้างบนตัดสินแล้ว ไม่ใช่ร่าง เขียน migration ตามนี้ได้เลย

> ⚠️ **"ปิดไว้" ต้องปิดด้วยกลไกที่ปิดได้จริง** — `FeatureService.isEnabled()` ตอนนี้ `return true` เสมอ การดักด้วยมันเฉย ๆ จึงเท่ากับเปิด · ดู [`checklists/phase-1.md`](../checklists/phase-1.md) §0

**ไม่มีคอลัมน์เก็บ access / refresh token ของ provider** — Taskflow ใช้แค่ identity ตอน login ไม่ได้เรียก API ของ Google ต่อ · เก็บไว้คือถือ credential ของคนอื่นที่ไม่ได้ใช้

`ON DELETE CASCADE` ต่างจาก `created_by` ที่เป็น RESTRICT ทั้งระบบ เพราะแถวนี้ไม่ใช่ประวัติ — มันคือ "ปัจจุบันผูกอยู่กับอะไร" · user ถูก anonymize เมื่อไหร่ การผูกกับ Google ต้องหายไปด้วย ไม่ใช่ค้างอยู่ให้ล็อกอินกลับเข้ามาได้

จับคู่ด้วย `provider_user_id` ไม่ใช่อีเมล — คนเปลี่ยนอีเมลใน Google ได้ แต่ `sub` คงที่ตลอด · อีเมลใช้แค่ตอน**ครั้งแรก**ที่ยังไม่มีแถวนี้ เพื่อหา user เดิมมา link ([policy เต็ม](./01-architecture.md#auth))

**RBAC ระดับระบบ — สิทธิ์ทั้งเว็บ ไม่ใช่ระดับ org**

> สร้างตารางไว้ตั้งแต่ Phase 0 แต่ **ไม่มีโค้ดอ่านจนถึง Phase 7**

```
roles                            -- 'support' | 'engineer' | 'admin'
  name                text  unique
  description         text

permissions                      -- seed จาก migration ตาม key ที่นิยามในโค้ด
  key                 text  unique   'org.read' | 'org.suspend'
                                     | 'user.impersonate' | 'billing.refund'
                                     | 'log.read' | 'role.manage'
  description         text

role_permissions
  role_id             uuid  FK
  permission_id       uuid  FK
  UNIQUE (role_id, permission_id)

user_roles
  user_id             uuid  FK
  role_id             uuid  FK
  granted_by          uuid  null · FK → identity.users · SET NULL
                            -- เก็บไว้แม้ดูซ้ำกับ created_by เพราะ ON DELETE ต่างกัน:
                            -- created_by เป็น RESTRICT → ลบ admin ที่เคยให้สิทธิ์ไม่ได้เลย
                            -- granted_by เป็น SET NULL → สิทธิ์อยู่ต่อได้แม้ admin หายไป
  expires_at          timestamptz null    -- ให้สิทธิ์ชั่วคราวตอน debug แล้วหมดอายุเอง
  UNIQUE (user_id, role_id)   -- granted_at คือ created_at
```

> ชื่อตารางไม่ต้องมี `system_` นำหน้า — schema `identity` บอกบริบทอยู่แล้ว และไม่ชนกับ role ใน org ที่อยู่ `organization.members.role`
>
> แต่ในโค้ด TypeScript ตั้งชื่อ class ว่า `SystemRole` / `SystemPermission` กันสับสน

- Permission **key นิยามในโค้ด** (`SYSTEM_PERMISSIONS` const) ได้ type safety
- **Mapping role → permission อยู่ใน DB** เปลี่ยนได้โดยไม่ต้อง deploy
- คนที่มี system role **ไม่ได้เป็นสมาชิก org โดยอัตโนมัติ** — เข้าถึงผ่าน permission หรือ impersonate เท่านั้น ห้ามแอบใส่ตัวเองเข้า `organization.members`

### Schema `organization`

```
organizations                            -- ไม่มี org_id (เท่ากับ id เสมอ) · ไม่มี owner_id (คือ created_by)
  name                text
  slug                text     unique

members                                  -- สมาชิกของ org
  user_id             uuid  FK → identity.users
  role                text  'owner' | 'admin' | 'member'   (string ไม่ใช่ enum)
  UNIQUE (org_id, user_id)   -- วันที่เข้า org คือ created_at ไม่ต้องมี joined_at
  -- ต้องมี role='owner' อย่างน้อย 1 แถวเสมอ (บังคับที่ application)
  -- owner มีได้หลายคน (โมเดลแบบ GitHub) — ห้ามลบ/ลดสิทธิ์คนสุดท้าย

teams
  name                text
  description         text  null

team_members
  team_id             uuid  FK
  user_id             uuid  FK → identity.users
  role                text  'admin' | 'member'   (admin มีได้หลายคน)
  UNIQUE (team_id, user_id)
```

### Schema `project`

```
projects
  name                    text
  description             text     null
  icon                    text     null   emoji
  completion_policy       text     'anyone' (default) | 'privileged'
  auto_complete_parent    boolean  default false
  sprint_enabled          boolean  default false
  estimate_unit           text     'none' (default) | 'point' | 'hour' | 'tshirt'  (Phase 4)

members                                  -- สมาชิกของ project
  project_id          uuid  FK
  user_id             uuid  FK
  role                text  'admin' | 'member'
  UNIQUE (project_id, user_id)

statuses
  project_id          uuid     FK
  name                text
  color               text     token จาก palette 8 สี ไม่ใช่ hex
  sort_order          text COLLATE "C"  · fractional-indexing
  is_default          boolean  status ตั้งต้นของ task ใหม่ — 1 project มีได้ 1 อัน
  is_done_type        boolean  นับเป็น "เสร็จ" — ต้องมีอย่างน้อย 1 อัน
  is_cancelled_type   boolean  นับเป็น "ยกเลิก" — ตัดออกจากตัวหารของ progress
  -- is_done_type กับ is_cancelled_type เป็น true พร้อมกันไม่ได้

  CREATE UNIQUE INDEX ON project.statuses (project_id) WHERE is_default = true;

sprints                                          (Phase 2)
  project_id          uuid  FK
  name                text
  goal                text  null
  start_date          date         วันที่ล้วน ไม่มีเวลา
  end_date            date         วันที่ล้วน ไม่มีเวลา
  status              text  'planned' | 'active' | 'completed'
  sort_order          text COLLATE "C"

  CHECK (status IN ('planned', 'active', 'completed'))
  CREATE UNIQUE INDEX ON project.sprints (project_id) WHERE status = 'active';
```

### Schema `task`

```
tasks
  project_id          uuid       FK → project.projects
  title               text
  description         text       null
  status_id           uuid       FK → project.statuses
  priority            text       'low' | 'medium' | 'high' | null
  due_date            timestamptz  null · เก็บ UTC แปลง timezone ที่ frontend
  sort_order          text COLLATE "C"

  parent_task_id      uuid       null · FK → task.tasks (self)
  depth               int        default 0 · คำนวณตอน insert (parent.depth + 1)
                                 MAX_TASK_DEPTH = 1 ใน Phase 2 (2 ชั้น) · 2 ใน Phase 5 (3 ชั้น)
                                 บังคับสองฝั่ง: CHECK ใน DB + constant ใน @repo/shared
                                 ขยับเพดาน = ต้องเขียน migration ไม่ใช่แก้ constant อย่างเดียว

  completed_by        uuid       null · reset เป็น null เมื่อเปลี่ยนกลับจาก done
  completed_at        timestamptz  null · reset พร้อมกัน

  sprint_id           uuid       null  (Phase 2) · null = Backlog
                                 sub-task (depth > 0) ห้ามมีค่าของตัวเอง — ตาม parent
  estimate            numeric    null  (Phase 4)
  custom_fields       jsonb      default '{}'  (Phase 4) · key = field UUID ไม่ใช่ชื่อ

  CREATE INDEX ON task.tasks (org_id, project_id, status_id);
  CREATE INDEX ON task.tasks (org_id, parent_task_id);
  CREATE INDEX ON task.tasks (org_id, sprint_id);
  CREATE INDEX ON task.tasks USING gin (custom_fields);   -- Phase 4

assignees
  task_id             uuid  FK
  assignee_type       text  'user' | 'team'
  assignee_id         uuid  ชี้ไป identity.users หรือ organization.teams ตาม type (ไม่มี FK)
  UNIQUE (task_id, assignee_type, assignee_id)   -- assigned_at คือ created_at
```

### Schema `audit`

> 🔒 **ต้องทำ** — partition รายเดือน + composite PK ตั้งแต่แรก · **ห้ามลบข้อมูลเด็ดขาด**

```
logs
  entity_type         text   'task' | 'project' | 'status' | 'sprint' | ...
  entity_id           uuid   ไม่มี FK (polymorphic)
  actor_id            uuid   คนที่ทำ
  action              text   'created' | 'updated' | 'deleted' | 'completed' | 'assigned' | ...
  changes_json        jsonb  { field: { from, to } }
  occurred_at         timestamptz

  CREATE INDEX ON audit.logs (org_id, entity_type, entity_id, occurred_at DESC);
  CREATE INDEX ON audit.logs (org_id, actor_id, action, occurred_at DESC);

  -- โตเร็วที่สุดในระบบ → partition รายเดือนตั้งแต่แรก (ทำทีหลังต้องย้ายข้อมูลทั้งตาราง)
  PARTITION BY RANGE (occurred_at)
  PRIMARY KEY (id, occurred_at)
  -- ⚠️ Postgres บังคับให้ partition key อยู่ใน unique/primary key ทุกตัว
  --    PRIMARY KEY (id) เฉยๆ จะสร้างไม่ผ่าน → entity ฝั่ง TypeORM ต้องเป็น composite
  --    audit.logs จึงเป็นตารางเดียวที่ไม่ใช้ base entity เลยสักคอลัมน์
  -- ห้ามลบ · archive หลัง 2 ปี
  -- index ตัวที่สองใช้กับ assignee picker (คนที่เพิ่ง assign ล่าสุด)
  -- changes_json เป็น NOT NULL DEFAULT '{}' — action อย่าง 'created' ไม่มี diff
```

**Partition — สร้างล่วงหน้า 12 เดือน + มี `DEFAULT` รับท้าย**

`audit.ensure_month_partition(date)` สร้าง partition ของเดือนนั้นถ้ายังไม่มี · เรียกซ้ำได้ไม่มีผลข้างเคียง · job รายเดือนแค่เรียกฟังก์ชันนี้ ไม่ต้องไปคำนวณชื่อกับขอบเขตเองในโค้ด

**`audit.logs_default` มีไว้เพราะ audit row เขียนใน transaction เดียวกับ business logic** — แถวที่ไม่มี partition ให้ลงไม่ได้แค่ทำ log หาย แต่**ทำให้งานของผู้ใช้ล้มไปด้วย** · partition ที่ลืมสร้างจึงต้องเป็นเรื่องที่รอดได้ ไม่ใช่เรื่องที่ทำระบบเขียนไม่ได้

> ⚠️ ราคาของ `DEFAULT`: ตราบใดที่ยังมีแถวของเดือนไหนค้างอยู่ใน `logs_default` จะ **สร้าง partition ของเดือนนั้นไม่ได้** (Postgres ต้องพิสูจน์ว่าไม่มีแถวใน default ที่ควรอยู่ใน range ใหม่) · ขึ้น error ชัดเจนว่า `would be violated by some row` ไม่ได้เงียบ
>
> **ถือว่ามีแถวใน `logs_default` = alert** ต้องย้ายออกก่อนสร้าง partition ของเดือนนั้น

### Schema `discussion`

```
comments                                         (Phase 3)
  entity_type         text   'task' | ...
  entity_id           uuid   ไม่มี FK
  parent_comment_id   uuid   null · FK → discussion.comments (self) · ON DELETE CASCADE · thread แบบ Slack
  body                text
  edited_at           timestamptz  null
  CREATE INDEX ON discussion.comments (org_id, entity_type, entity_id, created_at);

attachments                                      (Phase 3)
  entity_type         text
  entity_id           uuid   ไม่มี FK
  file_name           text
  file_size           bigint
  mime_type           text
  storage_key         text   key ใน object storage
  CREATE INDEX ON discussion.attachments (org_id, entity_type, entity_id);
```

### Schema `field` (Phase 4)

```
definitions
  project_id          uuid  FK
  name                text
  type                text  'text' | 'date' | 'number' | 'select'
  config_json         jsonb  เช่น ตัวเลือกของ select
  sort_order          text COLLATE "C"
  -- ค่าเก็บใน task.tasks.custom_fields (jsonb) ไม่มีตารางเก็บค่าแยก
```

### Schema `view` (Phase 4)

```
views
  project_id          uuid  FK
  name                text
  type                text  'table' | 'board' | 'calendar'
  owner_id            uuid  null = view กลางของ project · มีค่า = view ส่วนตัว
  filter_json         jsonb
  sort_json           jsonb
  group_by            text  null

columns
  view_id             uuid  FK
  column_type         text  'builtin' | 'custom_field'
  column_key          text  'status' | 'assignee' | <field UUID>
  sort_order          text COLLATE "C"
  width               int   null
  is_visible          boolean
```

### Schema `chat` (Phase 2)

> 🔒 **ต้องทำ** — 1 `external_channel_id` ผูกได้ org เดียว (unique index) กันข้อความข้ามบริษัท

```
identities
  user_id             uuid  FK
  platform            text  'discord' | 'line' | 'teams'
  external_id         text  user id ฝั่งนั้น — เป็นข้อมูลส่วนบุคคล ต้องล้างตอน anonymize
  linked_at           timestamptz
  UNIQUE (platform, external_id)

channels
  project_id          uuid  FK
  platform            text
  external_channel_id text
  default_assignee_id uuid  null
  UNIQUE (platform, external_channel_id)   -- 1 ห้องผูกได้ org เดียว กันข้อมูลข้ามบริษัท
```

### Schema `notify`

```
outbox
  recipient_id        uuid
  channel             text   'email' | 'discord' | 'line'
  template            text   'task_assigned' | 'due_soon' | ...
  payload_json        jsonb
  status              text   'pending' | 'sent' | 'failed'
  attempts            int    default 0
  sent_at             timestamptz  null
  last_error          text   null
  CHECK (status IN ('pending', 'sent', 'failed'))
  CREATE INDEX ON notify.outbox (status, created_at) WHERE status = 'pending';
```

### Schema `billing` — Empty Tables, Reserved for Later

สร้างตารางไว้ใน Phase 0 แต่**ไม่มีโค้ดแตะจนกว่าจะถึง Phase 7** · รายละเอียดอยู่ใน [`05-saas-notes.md`](./05-saas-notes.md)

```
plans           (id, name, max_users, price_monthly, price_yearly,
                 ai_multiplier, ai_daily_limit, features_json)

subscriptions   (id, org_id, plan_id, status, current_period_end, seats_used)

ai_wallet       (id, org_id, source, units_granted, units_used,
                 period_key, expires_at)

ai_usage        (org_id, user_id, period_day, period_week,
                 tokens_in, tokens_out, feature)
```
