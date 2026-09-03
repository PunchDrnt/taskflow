# Schema Batch — งานที่ต้องจบก่อนเขียนโค้ด Phase 1

ขั้น 4 ของการ replan · วางแผนเมื่อ 2026-09-03 · ที่มาของทุกข้อคือ
[`decisions.md`](./decisions.md) และ [`audit.md`](./audit.md) · สเปกที่ถูกต้องอยู่ที่
[`docs/02-database/schema.md`](../docs/02-database/schema.md) ไฟล์นี้แค่บอกว่า **ลงมือยังไง**

**ยังไม่ deploy อะไรเลย** → แก้ `CREATE TABLE` เดิมในที่ ไม่มี `ALTER TABLE` สักบรรทัด
ปิดท้ายรอบเดียวด้วย `db:reset`

> ✅ **ทำครบทุกข้อแล้ว 2026-09-03** — `db:reset` ผ่าน (12 migrations + 6 permission)
> `db:seed` ผ่าน · `lint` · `check-types` · `build` · `format:check` · `test` เขียวหมด
> (23 ไฟล์ / 168 tests · integration รันจริงไม่ถูก skip)
>
> **สามอย่างที่แผนไม่ได้เขียนไว้แต่ต้องแก้ตาม** — fixture ในเทสต์ที่ insert project/task/view
> ตรงๆ (`retention` · `cascade-soft-delete` · `org-isolation` · `audit` · `schema-invariants`)
> ต้องเติมคอลัมน์ใหม่ที่ NOT NULL · `reset.ts` มีรายชื่อ schema ของตัวเองต้องเติม
> `automation` ด้วย (และตอนนี้เรียก required seed ต่อท้าย ไม่งั้น reset แล้วไม่มี permission) ·
> ลิงก์ใน `phase-0.md` ที่ชี้ `seed.ts` ต้องตามไฟล์ที่ย้าย ซึ่ง `docs-links.spec.ts` จับได้เอง

## ตอบสี่คำถามที่ decisions.md ค้างไว้

| คำถาม | คำตอบ |
| --- | --- |
| renumber ไฟล์ migration ไหม | **ไม่ต้อง** — เหตุผลเดียวที่จะต้อง renumber คือไฟล์ใหม่ไปต่อท้าย `SeedSystemPermissions` แต่รอบนี้**ไม่มีไฟล์ใหม่เลย** (ตารางใหม่ลงไฟล์ของ schema ตัวเอง) และ `SeedSystemPermissions` ย้ายออกไปเป็น seed พอดี |
| RLS ลงยังไง | ไฟล์แยกใบเดียว · **Phase 2 ไม่ใช่รอบนี้** |
| squash เหลือไฟล์เดียวไหม | **ไม่** — docblock ในแต่ละไฟล์คือบันทึกว่าทำไมตารางเป็นแบบนั้น squash แล้วบันทึกไม่มีที่อยู่ |
| `chat.*` soft delete ไหม | **ยังไม่ต้องตอบ** — chat ย้ายไป Phase 4 แล้ว ตารางยังไม่สร้างรอบนี้ |

เหลือ **12 ไฟล์** หลังจบรอบ (13 − `SeedSystemPermissions`) · ไฟล์ใหม่ที่จะมาทีหลัง
(RLS · chat) ได้ timestamp ใหม่ซึ่งไปต่อท้ายพอดีกับเฟสของมันอยู่แล้ว

## แก้ migration 6 ไฟล์

### 1. `CreateSchemas`

- เพิ่ม `automation` (Phase 5) — docblock ของไฟล์เขียนเองว่า "all of them up front"
  แต่ตกไปหนึ่งตัว · schema เปล่าไม่มีต้นทุน
- คอมเมนต์ `chat` แก้จาก `(Phase 2)` เป็น `(Phase 4)`

### 2. `CreateIdentityUsers`

```
failed_login_attempts  integer      NOT NULL DEFAULT 0
locked_until           timestamptz
```

**ไม่มี CHECK** — ตาม [กติกา CHECK vs enum](../docs/02-database/README.md) CHECK มีไว้ให้กับ
ค่าที่ constraint อื่นแอบพึ่งอยู่ · ไม่มี index ไหนอ่านสองคอลัมน์นี้

### 3. `CreateOrganization` — เพิ่มตาราง `invitations`

`OrgScopedEntity` (org ✓ · แก้ได้ ✓ · soft delete ✗ — `revoked_at` คือตัวจบชีวิตแถว
ทรงเดียวกับ `password_reset_tokens.used_at`)

```
org_id       uuid    NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE
email        citext  NOT NULL
role         text    NOT NULL   CHECK (role IN ('admin', 'member'))
token_hash   text    NOT NULL
expires_at   timestamptz NOT NULL
accepted_at  timestamptz
accepted_by  uuid    REFERENCES identity.users(id) ON DELETE RESTRICT
revoked_at   timestamptz

CREATE UNIQUE INDEX ON organization.invitations (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX ON organization.invitations (token_hash) WHERE accepted_at IS NULL;
```

FK ของ `org_id` ชี้ `organizations(id)` ตรงๆ ไม่ต้อง composite — ตัวมันเองคือลูกชั้นแรก
ทรงเดียวกับ `project.projects`

### 4. `CreateProject` — ตาราง `projects`

| | |
| --- | --- |
| ลบ | `icon` |
| เพิ่ม | `color text NOT NULL` · token จาก palette ไม่ใช่ hex ทรงเดียวกับ `statuses.color` |
| เพิ่ม | `key_prefix text NOT NULL` + `CHECK (key_prefix ~ '^[A-Z][A-Z0-9]{1,5}$')` |
| เพิ่ม | 🔒 `next_task_number integer NOT NULL DEFAULT 1` |
| เพิ่ม | `archived_at timestamptz` — **ไม่มี `archived_by` และไม่มี CHECK ผูก** archive คือซ่อน ไม่ใช่ลบ |
| เพิ่ม | `stale_after_days integer` (Phase 3) · null = ปิดการเตือน |

`key_prefix` **ไม่มี unique** — docs เขียนไว้ชัดว่าซ้ำกันได้ในหนึ่ง org
· CHECK นี้เป็นชนิด "รูปแบบ" ซึ่งเป็นหมวดที่สามใน README ไม่ใช่หมวดเดียวกับ enum

> prototype ตรวจ `^[A-Z0-9]{2,6}$` ซึ่งยอมให้ `12` เป็น prefix · **docs เป็นตัวตัดสิน**
> ตัวแรกต้องเป็นตัวอักษร — ฝั่งเว็บใช้ regex ตาม docs ไม่ใช่ตาม prototype

### 5. `CreateTask` — ตาราง `tasks`

```
number  integer  NOT NULL

-- 🔒 index เต็ม ไม่ใช่ partial — ข้อยกเว้นเดียวของกติกา soft-delete
CREATE UNIQUE INDEX tasks_project_number_unique ON task.tasks (project_id, number);
```

**`priority` ไม่ต้องแตะ database** — เพิ่ม `TASK_PRIORITIES` 4 ค่าใน `@repo/shared`
แล้วให้ zod เป็นคนกัน · ไม่มี index หรือ constraint ไหนพึ่งค่าพวกนี้ จึงไม่ใส่ CHECK
ต่างจาก `sprints.status` ที่มี CHECK เพราะ partial index อ่านค่า `'active'` ตรงๆ

### 6. `CreateFieldAndView` — ตาราง `views`

| | |
| --- | --- |
| แก้ | `sort_json` default `'{}'` → **`'[]'`** · เป็น array เพราะเรียงหลายชั้นตามลำดับ |
| เพิ่ม | `sort_order text COLLATE "C" NOT NULL` — ลำดับแท็บ view |
| เพิ่ม | `is_default boolean NOT NULL DEFAULT false` |

```sql
CREATE UNIQUE INDEX views_single_default_unique ON view.views (project_id)
  WHERE is_default AND owner_id IS NULL AND deleted_at IS NULL;
CREATE INDEX views_project_order_idx ON view.views (org_id, project_id, sort_order);
```

`owner_id IS NULL` อยู่ในเงื่อนไขด้วย เพราะ default ที่ว่าคือ view กลางของ project
view ส่วนตัวของแต่ละคนไม่เกี่ยว

### 7. `CreateNotifyOutbox` → เปลี่ยนชื่อเป็น `CreateNotify`

เปลี่ยน **ชื่อไฟล์และชื่อคลาสพร้อมกัน** timestamp เดิม (TypeORM เรียงจากเลขท้าย _ชื่อคลาส_)
แล้วเพิ่มตาราง `notifications` เข้าไปในไฟล์เดียวกัน — หนึ่งไฟล์ต่อหนึ่ง schema
เหมือนที่ไฟล์อื่นทำอยู่ · `OrgScopedEntity` ไม่ soft delete

```
recipient_id  uuid    NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
type          text    NOT NULL
actor_id      uuid    REFERENCES identity.users(id) ON DELETE RESTRICT   -- null = ระบบทำ
entity_type   text    NOT NULL
entity_id     uuid    NOT NULL      -- polymorphic เหมือน audit.logs ไม่มี FK
payload_json  jsonb   NOT NULL DEFAULT '{}'::jsonb
read_at       timestamptz

CREATE INDEX ON notify.notifications (org_id, recipient_id, created_at DESC);
CREATE INDEX ON notify.notifications (org_id, recipient_id) WHERE read_at IS NULL;
```

## ตามไปให้ครบทุกครั้งที่แตะตาราง

- `database/entities.ts` — ลิสต์ชัดเจน ไม่ใช้ glob · เพิ่ม `Invitation` และ `Notification`
- `*.entity.ts` ของตารางนั้น — ใหม่สองไฟล์: `organization/invitation.entity.ts` ·
  `notify/notification.entity.ts`
- `schema.md` — **เขียนครบแล้วตอนขั้น 2** รอบนี้แค่ทำให้โค้ดตามให้ทัน
- ปิดท้าย `db:reset` แล้ว `test/schema-drift.spec.ts` ต้องเขียว

## แยก seed เป็นสองไฟล์

```
src/database/seed/
  required.ts   →  db:seed:required   ต้องมีทุกที่รวม production · idempotent
  demo.ts       →  db:seed            ของเดิมย้ายมา · ปฏิเสธ production เหมือนเดิม
```

- ลบ migration `SeedSystemPermissions` ทิ้ง แล้ว `required.ts`
  **`import { SYSTEM_PERMISSIONS }` ตรงๆ** ได้ ซึ่ง migration ทำไม่ได้
- ใช้ `ON CONFLICT DO NOTHING` (ตัดสินแล้ว) — 6 แถวที่ยังไม่มีใครอ่านจนถึง Phase 7
  เพิ่ม key ใหม่ได้ · ลบ key แล้วแถวเก่าค้าง ซึ่งยอมรับได้
- ท่อนใน `test/schema-invariants.spec.ts` ที่คอยจับ drift ระหว่างสองรายการ **ลบทิ้ง**
  หมดหน้าที่แล้ว
- `demo.ts` ต้องแก้ตามคอลัมน์ใหม่ที่ NOT NULL — `projects.color` · `projects.key_prefix` ·
  `tasks.number` ไม่งั้น seed พังทันที
- `deploy/compose.yml` `api-migrate` ตอนนี้เป็น exec array เรียก typeorm CLI ตรงๆ
  ไม่มี shell → เปลี่ยนเป็น **entrypoint เดียว** ที่ `runMigrations()` แล้วรัน required seed ต่อ
  (ทรงเดียวกับ `reset.ts` ที่เรียก `runMigrations()` เองอยู่แล้ว) ไม่ใช้ `sh -c`

## ที่ต้องรู้ว่ายังไม่ได้ทำ

- **retention ยังไม่กวาดสองตารางใหม่** — `resolvePurgeOrder` อ่านจาก catalog โดยหาตาราง
  ที่มี `deleted_at` · ทั้ง `invitations` และ `notifications` ไม่มี จึงไม่เข้ารอบกวาดเอง
  ต้องเขียน sweep ของตัวเอง: invitations คู่กับ API ตอน **Phase 2** · notifications ตอน
  **Phase 3** — ไม่ใช่รอบนี้ แต่ต้องไม่ลืม
- docblock ของ `purgePasswordResetTokens` เขียนว่า _"Valid for ten minutes"_ · ตัดสินไป
  แล้วว่า **30 นาที** — แก้คอมเมนต์ในรอบนี้เลย ตัวเลขจริงไปอยู่ใน `env.ts` ตอน PR auth
- env var ของ auth (`JWT_SECRET` · `LOGIN_MAX_ATTEMPTS` · `LOGIN_LOCK_MINUTES` ·
  TTL ของ reset token) อยู่ใน PR auth ไม่ใช่รอบนี้ — รอบนี้ลงแค่ **คอลัมน์**

## ลำดับลงมือ

1. `feat(api)!: set the Phase 1 schema` — migration 6 ไฟล์ + entity + `@repo/shared`
2. `refactor(api): split the seed into required and demo` — รวม `deploy/compose.yml`
3. `yarn workspace @api/core db:reset` แล้ว gate เต็ม —
   `yarn lint` · `check-types` · `build` · `test` · `format:check`
   และต้องเห็นว่า integration suite **รันจริง** ไม่ใช่ถูก skip

จบสามข้อนี้แล้ว schema นิ่ง — งานถัดไปคือ PR auth ซึ่งไม่ต้องแตะ migration อีก
