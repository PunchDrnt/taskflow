# Database Rules

กติกาที่ใช้กับทุกตาราง — FK · การแยกข้อมูลตาม org · คอลัมน์ที่ทุกตารางมี

> [← Database](./README.md) · [ทุกตาราง](./schema.md) · เกี่ยวข้อง: [`01-architecture.md`](../01-architecture.md)

---

## Foreign Key Rules

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

**เลือก action จากความหมายของการอ้างอิง ไม่ใช่จากรูปร่างของตาราง**

| ปลายทางของ FK คืออะไร | Action |
| --- | --- |
| **ลูกที่ไม่มีความหมายถ้าแม่หายไป** — status ของ project, member ของ team | `CASCADE` |
| **การอ้างอิงที่เป็นตัวเลือก** — แถวยังมีความหมายถ้าไม่มีมัน (task ไม่มี sprint = อยู่ Backlog) | `SET NULL` — คอลัมน์ต้อง nullable |
| **การอ้างอิงที่เป็น _ประวัติ_** — ใครสร้าง ใครปิด ใครเคยเป็นสมาชิก | `RESTRICT` |
| **ข้อมูลของผู้ใช้ที่หายเงียบไม่ได้** แม้จะดูเหมือนลูก | `RESTRICT` — ดูกับดักด้านล่าง |

> **กับดัก: `task.tasks.project_id` เป็น `RESTRICT` ทั้งที่ task คือลูกของ project เต็มตัว**
>
> เพราะ `CASCADE` แปลว่าลบ project ทิ้งแล้ว task หายไปทั้งชุดโดยไม่มีอะไรทัดทาน · การลบ project จริงๆ เดินผ่าน [`cascade-soft-delete.ts`](../../../apps/api/core/src/shared/entity/cascade-soft-delete.ts) ที่ carry ลงไปใน transaction เดียว **`RESTRICT` คือตาข่ายที่ทำให้ลืมเขียน service แล้วพังดัง ไม่ใช่พังเงียบ**
>
> นี่คือเหตุผลที่ `AGGREGATE_CHILDREN` เขียนด้วยมือแทนที่จะอ่านจาก `pg_constraint` — ตาราง FK ตอบไม่ได้ว่าอะไรเป็นลูกของอะไรในความหมายที่ cascade ต้องการ

**ที่มีตอนนี้** — บัญชีของจริง ไม่ใช่กติกา · FK ใหม่ตัดสินจากตารางข้างบน

| FK                                                                                          | Action                    |
| ------------------------------------------------------------------------------------------- | ------------------------- |
| `project.statuses.project_id` · `project.members.project_id` · `project.sprints.project_id` | `CASCADE`                 |
| `chat.channels.project_id` · `field.definitions.project_id` · `view.views.project_id`       | `CASCADE`                 |
| `task.assignees.task_id` · `task.tasks.parent_task_id`                                      | `CASCADE`                 |
| `task.dependencies.predecessor_id` · `.successor_id` _(Phase 5)_                            | `CASCADE`                 |
| `automation.rules.project_id` _(Phase 5)_                                                   | `CASCADE`                 |
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

## Multi-tenancy

> 🔒 **ต้องทำ** — ตารางต้องมี `org_id` ถ้าแถวของมันเป็นของ org ใด org หนึ่ง · ยกเว้นแถวที่ไม่ได้เป็นของ org ไหนเลย ([เกณฑ์เต็ม + สามกรณี](#the-org_id-rule--one-test-not-a-list))

- `org_id` **ทุกตาราง ทุก schema** รวมถึงตารางกลาง — **ตารางกลางยิ่งต้องมี** เพราะ composite FK คือสิ่งเดียวที่กันการผูกข้าม org ([ทำไม](#เกณฑ์นี้ไม่ใช่-หา-org-จากแม่ได้มั้ย))
- Composite index ขึ้นต้นด้วย `org_id` เสมอ
  ```sql
  CREATE INDEX ON task.tasks (org_id, project_id, status_id);
  ```
- บังคับกรองผ่าน Guard/Interceptor ระดับ global ไม่ให้ dev จำเอง
- **Row-Level Security เปิดทุกตาราง — ทำใน Phase 2 ไม่ใช่ Phase 0** (`CREATE POLICY` เป็นงาน additive เพิ่มทีหลังได้โดยไม่ต้อง migrate) · Phase 0 ใช้ repository base class + isolation test · ดูเหตุผลเต็มใน [`01-architecture.md`](../01-architecture.md#org_id-scoping)
  - ⚠️ ต้องมี `FORCE ROW LEVEL SECURITY` ด้วย ไม่งั้น policy ไม่กันเจ้าของตารางและจะเงียบสนิทไม่มี error
  - ⚠️ ใช้ `set_config('app.current_org_id', $1, true)` ไม่ใช่ `SET LOCAL` (SET LOCAL รับ parameter ไม่ได้ → เสี่ยง SQL injection)

> ⚠️ พลาดครั้งเดียวตอนเป็น SaaS จริง = ข้อมูลข้ามบริษัทรั่ว — จุดนี้ต้องมี test

## Base Entity

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

### เลือกคอลัมน์ base — ตอบสามคำถาม

ตารางข้างบนคือกรณีปกติ ไม่ใช่กรณีบังคับ · ตารางใหม่ตอบสามคำถามนี้แล้วได้คำตอบเอง ไม่ต้องหาชื่อตัวเองในรายการ

| คำถาม | ถ้าใช่ | ถ้าไม่ |
| --- | --- | --- |
| **1.** แถวนี้เป็นของ org ใด org หนึ่งไหม | `org_id` | ไม่มี — [เกณฑ์เต็ม](#the-org_id-rule--one-test-not-a-list) |
| **2.** มีคอลัมน์ไหนถูก _แก้_ หลังสร้างไหม | `updated_at` · `updated_by` | ไม่มี |
| **3.** ลบแล้วต้อง _กู้คืน_ ได้ไหม | `deleted_at` · `deleted_by` + CHECK | ไม่มี — hard delete |

สามแกนนี้อิสระต่อกัน จึงมี 6 คลาสใน [`base.entity.ts`](../../../apps/api/core/src/shared/entity/base.entity.ts) ครบทุกการผสม (ที่ใช้จริง)

| คลาส | org_id | แก้ได้ | soft delete | ใช้กับ |
| --- | :-: | :-: | :-: | --- |
| `BaseEntity` | ✓ | ✓ | ✓ | ค่าปกติ — task, project, team |
| `SoftDeletableEntity` | ✗ | ✓ | ✓ | `identity.users` · `organizations` · `billing.plans` |
| `OrgScopedEntity` | ✓ | ✓ | ✗ | `notify.outbox` · `*.members` · `team_members` · `ai_usage` |
| `TimestampedEntity` | ✗ | ✓ | ✗ | `sessions` · `password_reset_tokens` |
| `CreatedEntity` | ✗ | ✗ | ✗ | `role_permissions` · `user_roles` · `oauth_accounts` _(Phase 1)_ |
| `OrgScopedCreatedEntity` | ✓ | ✗ | ✗ | `task.assignees` · `task.dependencies` _(Phase 5)_ |

#### คำถามที่ 2 ตอบยังไง — "แก้" ไม่ใช่ "เปลี่ยนสถานะ"

ถ้าคอลัมน์ที่ไม่ใช่ base มีแต่ FK กับค่าที่ตั้งครั้งเดียว **แถวนั้นไม่ถูกแก้** — มันเป็นข้อเท็จจริงที่จริงหรือไม่จริงเท่านั้น ไม่มีสถานะกลาง

`task.assignees` มีแค่ "task นี้มอบให้คนนี้ไหม" · `role_permissions` มีแค่ "สิทธิ์นี้ผูกกับ role นี้ไหม" · ถอนแล้วให้ใหม่คือ **ลบแถวสร้างใหม่ ไม่ใช่ UPDATE**

เก็บสองคอลัมน์นั้นไว้ = ค่าจะเท่ากับ `created_at`/`created_by` ตลอดไป พร้อมแบก FK `ON DELETE RESTRICT` ที่ไม่มีวันได้ใช้

ตรงข้ามกับ `organization.members` · `team_members` · `project.members` ที่มีคอลัมน์ `role` เปลี่ยนได้จริง (เลื่อนขั้น/ลดขั้น) จึงยังต้องมี · ส่วน `billing.ai_usage` ยังมีไว้เพราะ Phase 7-8 ยังไม่ commit ว่า token นับสะสมด้วย UPDATE หรือ insert ใหม่ทุกครั้ง

#### คำถามที่ 3 ตอบยังไง — สี่สัญญาณว่าอย่า soft delete

ตอบ **"ไม่"** ถ้าเข้าข้อใดข้อหนึ่ง เรียงจากหนักสุด

1. **ลืม filter แล้วเป็นช่องโหว่สิทธิ์ ไม่ใช่บั๊กการแสดงผล** — แถว `project.members` ที่ `deleted_at` มีค่าแต่ query ลืมกรอง = คนที่ถูกถอดออกยังเข้าถึง project ได้ · `identity.oauth_accounts` หนักกว่านั้นอีก เพราะ flow ล็อกอินหาแถวด้วย `provider_user_id` ตรงๆ ลืมกรองคือคนที่ unlink แล้ว**ล็อกอินกลับเข้ามาได้** · hard delete แล้วแถวไม่อยู่ ไม่มีอะไรให้ลืม
2. **มีคอลัมน์บอกสถานะ "ใช้ไม่ได้แล้ว" อยู่แล้ว** — `sessions.revoked_at` · `password_reset_tokens.used_at` · `outbox.status` · ตัวบอกการลบสองตัวในตารางเดียวย่อมขัดกันได้ (บั๊กแบบเดียวกับที่ `identity.users` เคยมี)
3. **การ "ลบ" คือความสัมพันธ์เปลี่ยน ไม่ใช่ข้อมูลถูกทำลาย** — เพิ่มกลับต้นทุนศูนย์ ไม่มีอะไรให้กู้ · soft delete ทำให้ถอด-ใส่ซ้ำสะสมแถวตาย และ upsert ต้องคิดเผื่อทุกครั้ง
4. **เป็นบันทึกแบบ append-only** เช่น `billing.ai_usage` ที่เป็นการใช้เงิน — ให้ retention ลบจริง soft delete ไม่ตรงความหมาย

**และของที่คนมัก soft delete ไว้เผื่อ ที่นี่มีของที่ดีกว่าอยู่แล้ว** — `audit.logs` partition รายเดือน ไม่เคยลบ (🔒) บันทึกว่าใครถอดใครออกเมื่อไหร่ ครบกว่า `deleted_by` ตัวเดียวมาก

**cascade ไม่ลงไปหาตารางที่ hard delete** โดยตั้งใจ — soft delete project แล้ว member ยังอยู่ครบ **restore แล้วได้คนเดิมกลับมา** · ตอน retention ลบจริง `ON DELETE CASCADE` ของ FK เก็บกวาดให้เอง

#### `audit.logs` ไม่เข้าเกณฑ์นี้เลย

ตารางเดียวที่ไม่ใช้ base entity สักคอลัมน์ — composite PK และ `occurred_at`/`actor_id` ทำหน้าที่แทน `created_at`/`created_by` อยู่แล้ว · `organization.organizations` ก็ไม่มี `org_id` เพราะมันจะเท่ากับ `id` เสมอ (คำถามที่ 1 ตอบไปแล้ว)


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

## The `org_id` Rule — One Test, Not a List

> **ตารางต้องมี `org_id` ถ้าแถวของมันเป็นของ org ใด org หนึ่ง**
> ข้อยกเว้นคือแถวที่ **ไม่ได้เป็นของ org ไหนเลย** — ตอนนี้มีสามกรณี และทั้งสามเป็น _ผลลัพธ์_ ของเกณฑ์นี้ ไม่ใช่รายชื่อที่ตั้งขึ้นมาแยกต่างหาก

เขียนเป็นเกณฑ์เพราะตารางใหม่โผล่มาเรื่อยๆ · รายชื่อข้อยกเว้นตอบได้แค่ตารางที่มีอยู่แล้ว พอเจอตารางที่ไม่อยู่ในลิสต์ คนอ่านต้องเดาเอง แล้วเดาผิดทางไหนก็ได้

**กรณีที่ 1 — schema `identity` ทั้งก้อน** ไม่มี `org_id` เพราะ:

| ตาราง                                                    | เหตุผล                                          |
| -------------------------------------------------------- | ---------------------------------------------- |
| `users`                                                  | 1 user อยู่ได้หลาย org ผ่าน `organization.members` |
| `sessions`, `password_reset_tokens`                      | ผูกกับ user ไม่ใช่ org                             |
| `roles`, `permissions`, `role_permissions`, `user_roles` | สิทธิ์ระดับทั้งเว็บ อยู่**เหนือ** org                    |

> **กรณีที่ 2 — `billing.plans`** เป็นแค็ตตาล็อกราคาระดับทั้งระบบ ไม่ได้เป็นของ org ใด จึงไม่มี `org_id`
> ส่วน `billing.subscriptions`, `ai_wallet`, `ai_usage` มี `org_id` ตามปกติ

> **กรณีที่ 3 — `organization.organizations`** `org_id` ของมันจะเท่ากับ `id` ตัวเองเสมอ เก็บไว้ก็คือเก็บค่าเดิมสองที่ทุกแถว
>
> `OrgScopedRepository` จึง scope ตารางนี้ด้วย `id` แทน — เป็นเคสพิเศษ **หนึ่งจุดที่ตั้งใจ** ในโค้ดที่เดียว ไม่ใช่คอลัมน์ซ้ำที่ทุกแถวต้องแบก

### เกณฑ์นี้ไม่ใช่ "หา org จากแม่ได้มั้ย"

คำถามที่มาบ่อยคือ *"ตารางกลางที่ FK ชี้ไปตารางที่มี `org_id` อยู่แล้ว จะเก็บซ้ำทำไม"* — คำตอบคือ **ตารางกลางยิ่งต้องมี ไม่ใช่ยิ่งไม่ต้อง**

สมมติ `task.dependencies (predecessor_id, successor_id)` ที่ทั้งสองขาชี้ไป `task.tasks` · ถ้าไม่มี `org_id`:

```sql
INSERT INTO task.dependencies (predecessor_id, successor_id)
VALUES ('<task ของ org A>', '<task ของ org B>');   -- ผ่าน
```

FK แต่ละขาเช็คแค่ว่า task นั้นมีจริง **ไม่มีขาไหนรู้จักอีกขา** · จะกันได้ต้องเขียน trigger หรือเช็คในโค้ด ซึ่งเป็นของที่ลืมได้

พอมี `org_id` กฎ composite FK ที่ [Foreign Key Rules](#foreign-key-rules) บังคับอยู่แล้วจะปิดช่องนี้ให้เอง:

```sql
FOREIGN KEY (predecessor_id, org_id) REFERENCES task.tasks (id, org_id),
FOREIGN KEY (successor_id,   org_id) REFERENCES task.tasks (id, org_id)
```

สองขาถูกบังคับให้แชร์ `org_id` ค่าเดียวกันของแถวนั้น → **ผูกข้าม org ไม่ได้ในระดับ database** ไม่ต้องมีโค้ดเช็ค

อีกสองอย่างที่หายไปพร้อมกันถ้าไม่มีคอลัมน์นี้:

| หายไป | ทำไมสำคัญ |
| --- | --- |
| **RLS (Phase 2)** | policy เป็นราย table · ไม่มี `org_id` ต้องเขียนเป็น subquery ไล่ทุก FK ช้ากว่าและพลาดง่ายกว่า |
| **`queryBuilder.withOrg()`** | เป็น conditional type (`T extends { orgId } ? … : never`) — ตารางที่ไม่มีคอลัมน์นี้ **เรียกไม่ได้ตั้งแต่ compile** เหลือทางเดียวคือ `base()` ซึ่งแปลว่า "ตั้งใจข้าม org" → ทุก query บนตารางนั้นกลายเป็น query ที่ไม่ scope โดยปริยาย |

ราคาของการมี: 16 ไบต์ต่อแถว กับคอลัมน์ที่ยังไงก็อยู่หัว composite index อยู่แล้ว

ด้านล่างจะไม่เขียนฟิลด์ base ซ้ำ แสดงเฉพาะฟิลด์เฉพาะของแต่ละตาราง

