# Full Schema

ทุกตารางในระบบ · `(Phase N)` ข้างชื่อ**ฟิลด์** = คอลัมน์มีตั้งแต่ Phase 0 แต่เริ่มใช้ตอน Phase นั้น

`(Phase N)` ข้างชื่อ**ตาราง**หรือชื่อ **schema** = ตารางนั้นยังไม่มี สร้างตอน Phase นั้น
— เป็นได้เพราะการ**เพิ่มตารางใหม่**บนฐานข้อมูลที่มีข้อมูลแล้วราคาถูก ที่แพงคือการ**แก้ตารางเดิม**
ซึ่งเป็นเหตุผลที่คอลัมน์ต้องมาให้ครบตั้งแต่แรก แต่ตารางไม่ต้อง


> [← Database](./README.md) · [กติกา](./rules.md) — `org_id`, base entity, FK อยู่ที่นั่น

---

## Schema `identity`

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
  failed_login_attempts       int      default 0 · ล้างเป็น 0 เมื่อ login สำเร็จ
  locked_until                timestamptz null · ล็อกถึงเมื่อไหร่ · null = ไม่ถูกล็อก
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

**`deleted_at` กับ `status` ต้องตรงกันเสมอ** — `identity.users` มีตัวบอกการลบสองตัว (base entity ให้ `deleted_at` มา ส่วน lifecycle จริงของ user เดินด้วย `status` ตาม [User States](../04-features/phase-1.md#user-states--three-different-things)) · CHECK ผูกไว้ให้ขัดกันไม่ได้ ถ้าปล่อยไว้จะมีแถวที่ `deleted_at` ตั้งแล้วแต่ `status` ยังเป็น `active` แล้วอีเมลนั้นจะถูกจองค้างตลอดไป

```
sessions                                 -- 1 แถว = 1 การ login จาก 1 เครื่อง
  user_id                uuid  FK
  current_token_hash     text          hash ของ refresh token ที่ใช้ได้ตอนนี้
  previous_token_hash    text  null    อันก่อนหน้า — ใช้ทำ grace window + จับ token reuse
  rotated_at             timestamptz null  ใช้คำนวณ grace window 10 วินาที
  user_agent             text
  ip_address             inet
  last_used_at           timestamptz   -- เขียนแบบ lazy: ต่อเมื่อค่าเดิมเก่ากว่า 5 นาที
                                       -- เขียนทุก request จะทำให้ sessions เป็นตารางร้อน
                                       -- โดยได้ความละเอียดที่ไม่มีใครใช้
  expires_at             timestamptz   +15 วัน
  revoked_at             timestamptz null
  revoked_reason         text  null    'logout' | 'logout_all' | 'password_change'
                                       | 'password_reset' | 'token_reuse' | 'admin'

  CREATE INDEX ON identity.sessions (current_token_hash) WHERE revoked_at IS NULL;
  CREATE INDEX ON identity.sessions (user_id, revoked_at);
  -- ตัวจับ token reuse: หา session จาก token ที่ถูก rotate ไปแล้ว
  CREATE INDEX ON identity.sessions (previous_token_hash)
    WHERE previous_token_hash IS NOT NULL;

  -- rotation ไม่สร้างแถวใหม่ — แถวเดียวอยู่ตลอด 15 วัน แค่เปลี่ยน token hash
  -- 1 session มี refresh token ที่ใช้ได้ 1 อันเสมอ

password_reset_tokens
  user_id             uuid  FK
  token_hash          text          hash ไม่เก็บ plain
  expires_at          timestamptz   +30 นาที · เก็บเป็น env var ไม่ hardcode
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
  CREATE UNIQUE INDEX ON identity.oauth_accounts (provider, provider_user_id);
  -- 1 คน ผูก provider ละบัญชีเดียว · ผ่อนทีหลังแค่ drop index
  CREATE UNIQUE INDEX ON identity.oauth_accounts (user_id, provider);
```

**`CreatedEntity` — hard delete และไม่มี `updated_at`/`updated_by`** ([สามคำถาม](./rules.md#base-entity))

ตอบคำถามที่ 3 ว่า "ไม่" เพราะเข้าสัญญาณข้อ 1 เต็มๆ: flow ล็อกอินหาแถวด้วย `WHERE provider = $1 AND provider_user_id = $2` · **ลืม `AND deleted_at IS NULL` เมื่อไหร่ = คนที่ unlink ไปแล้วล็อกอินกลับเข้ามาได้** ซึ่งเป็นสิ่งที่ย่อหน้าล่างบอกเองว่าห้ามเกิด · hard delete แล้วแถวไม่อยู่ ไม่มีอะไรให้ลืม · unlink แล้ว link ใหม่คือคลิกเดียว ไม่มีอะไรให้กู้ และ `audit.logs` บันทึกว่าใครถอดเมื่อไหร่อยู่แล้ว

index จึงเป็น `UNIQUE` ธรรมดา ไม่ใช่ partial — ผลเหมือนกันเป๊ะโดยไม่ต้องมี state ค้าง: A unlink บัญชี G แล้วแถวหายไปเลย B เอา G ไปผูกได้ทันที

> ⚠️ **`ON DELETE CASCADE` บน `user_id` ไม่มีวันทำงาน — ต้อง `DELETE` เองตอน anonymise**
>
> CASCADE ยิงตอน hard delete เท่านั้น แต่ `identity.users` อยู่ใน [`NEVER_PURGED`](../../../apps/api/core/src/maintenance/retention.policy.ts) และการ anonymise เป็น `UPDATE` ไม่ใช่ `DELETE` · แถว oauth จึงค้างอยู่ถ้าไม่มีใครลบ แล้วเจอปัญหาข้างบนพอดี
>
> FK ยังคง `CASCADE` ไว้เป็นตาข่ายตอนลบ org ทิ้งจริง แต่**ห้ามพึ่งมันในเส้นทาง anonymise**

**ตารางนี้ยังไม่มีในฐานข้อมูล — Phase 1 migrate แต่ยังไม่เปิดใช้** เป็นแพทเทิร์นเดียวกับ `identity.roles` / `permissions` / `role_permissions` / `user_roles` ที่ลงตั้งแต่ Phase 0 แล้วไม่มีใครอ่านจนถึง Phase 7 · schema ข้างบนตัดสินแล้ว ไม่ใช่ร่าง เขียน migration ตามนี้ได้เลย

> ⚠️ **"ปิดไว้" ต้องปิดด้วยกลไกที่ปิดได้จริง** — `FeatureService.isEnabled()` เป็น allow-list ที่ว่างเปล่าแล้ว (Phase 1) ดักด้วยมันจึงเท่ากับปิดจริง · แต่ Google login ยังไม่มีโค้ดอ่านตารางนี้เลย ซึ่งเป็นกลไกที่ปิดแน่นกว่า

**ไม่มีคอลัมน์เก็บ access / refresh token ของ provider** — Taskflow ใช้แค่ identity ตอน login ไม่ได้เรียก API ของ Google ต่อ · เก็บไว้คือถือ credential ของคนอื่นที่ไม่ได้ใช้

`ON DELETE CASCADE` ต่างจาก `created_by` ที่เป็น RESTRICT ทั้งระบบ เพราะแถวนี้ไม่ใช่ประวัติ — มันคือ "ปัจจุบันผูกอยู่กับอะไร" · user ถูก anonymize เมื่อไหร่ การผูกกับ Google ต้องหายไปด้วย ไม่ใช่ค้างอยู่ให้ล็อกอินกลับเข้ามาได้

จับคู่ด้วย `provider_user_id` ไม่ใช่อีเมล — คนเปลี่ยนอีเมลใน Google ได้ แต่ `sub` คงที่ตลอด · อีเมลใช้แค่ตอน**ครั้งแรก**ที่ยังไม่มีแถวนี้ เพื่อหา user เดิมมา link ([policy เต็ม](../01-architecture.md#auth))

### RBAC ระดับระบบ — สิทธิ์ทั้งเว็บ ไม่ใช่ระดับ org

> สร้างตารางไว้ตั้งแต่ Phase 0 แต่ **ไม่มีโค้ดอ่านจนถึง Phase 7**

```
roles                            -- 'support' | 'engineer' | 'admin'
  name                text
  description         text
  -- partial ทั้งคู่: สองตารางนี้ soft delete ได้ (🔒)
  CREATE UNIQUE INDEX ON identity.roles (name) WHERE deleted_at IS NULL;

permissions                      -- seed จาก migration ตาม key ที่นิยามในโค้ด
  key                 text        'org.read' | 'org.suspend'
                                  | 'user.impersonate' | 'billing.refund'
                                  | 'log.read' | 'role.manage'
  description         text
  CREATE UNIQUE INDEX ON identity.permissions (key) WHERE deleted_at IS NULL;

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

## Schema `organization`

```
organizations                            -- ไม่มี org_id (เท่ากับ id เสมอ) · ไม่มี owner_id (คือ created_by)
  name                text
  slug                text
  CREATE UNIQUE INDEX ON organization.organizations (slug) WHERE deleted_at IS NULL;

members                                  -- สมาชิกของ org
  user_id             uuid  FK → identity.users
  role                text  'owner' | 'admin' | 'member'   (string ไม่ใช่ enum)
  UNIQUE (org_id, user_id)   -- วันที่เข้า org คือ created_at ไม่ต้องมี joined_at
  -- ต้องมี role='owner' อย่างน้อย 1 แถวเสมอ (บังคับที่ application)
  -- owner มีได้หลายคน (โมเดลแบบ GitHub) — ห้ามลบ/ลดสิทธิ์คนสุดท้าย

invitations                              -- ตารางมาตั้งแต่ Phase 1 · API + UI รอ Phase 2
  email               citext        คนที่ถูกเชิญ · ยังไม่ต้องมี account
  role                text          'admin' | 'member' — เชิญเป็น owner ไม่ได้
  token_hash          text          hash ไม่เก็บ plain (ทรงเดียวกับ password_reset_tokens)
  expires_at          timestamptz
  accepted_at         timestamptz null
  accepted_by         uuid        null · FK → identity.users · คนที่กดรับ
  revoked_at          timestamptz null

  CHECK (role IN ('admin', 'member'))
  -- คนเดียวมีคำเชิญค้างได้ใบเดียวต่อ org · เชิญซ้ำหลังหมดอายุหรือถูกยกเลิกได้
  CREATE UNIQUE INDEX ON organization.invitations (org_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
  CREATE INDEX ON organization.invitations (token_hash) WHERE accepted_at IS NULL;

teams
  name                text
  description         text  null
  CREATE UNIQUE INDEX ON organization.teams (org_id, name) WHERE deleted_at IS NULL;

team_members
  team_id             uuid  FK
  user_id             uuid  FK → identity.users
  role                text  'admin' | 'member'   (admin มีได้หลายคน)
  UNIQUE (team_id, user_id)
```

## Schema `project`

```
projects
  name                    text
  description             text     null
  color                   text     token จาก palette 8 สี ไม่ใช่ hex (ทรงเดียวกับ statuses.color)
  key_prefix              text     'DEV' · ตัวพิมพ์ใหญ่ 2-6 ตัว · ประกอบเป็น task key ตอนแสดงผล
  next_task_number        int      default 1 · เลขถัดไปที่จะแจก — ดูด้านล่าง
  archived_at             timestamptz null · ซ่อนจาก sidebar และ picker · ไม่ใช่การลบ
  stale_after_days        int      null (Phase 3) · null = ปิดการเตือนงานค้าง
  completion_policy       text     'anyone' (default) | 'privileged'
  auto_complete_parent    boolean  default false
  sprint_enabled          boolean  default false
  estimate_unit           text     'none' (default) | 'point' | 'hour' | 'tshirt'  (Phase 4)

  CHECK (key_prefix ~ '^[A-Z][A-Z0-9]{1,5}$')
  CREATE UNIQUE INDEX ON project.projects (org_id, name) WHERE deleted_at IS NULL;

**Task key = `key_prefix` + `tasks.number` ประกอบตอนแสดงผล** ไม่เก็บสตริงสำเร็จรูปไว้ที่ไหน
เปลี่ยน prefix แล้ว key เปลี่ยนทั้ง project ทันทีโดยไม่ต้อง backfill · prefix **ซ้ำกันได้ในหนึ่ง org**
เพราะผู้ใช้กรอกเอง ยอมรับว่า `TF-120` ชี้ได้สองงาน (ลิสต์แสดงชื่อ project ข้างเลขอยู่แล้ว)

> 🔒 **`next_task_number` เป็นคอลัมน์ ไม่ใช่ `MAX(number)+1`** — `MAX+1` จะแจกเลขซ้ำทันทีที่งาน
> ที่มีเลขสูงสุดถูกลบ ซึ่งทำให้ key ที่คนแปะไว้ในแชทชี้ผิดงาน · แจกเลขด้วย
> `UPDATE ... SET next_task_number = next_task_number + 1 RETURNING` ในทรานแซกชันเดียวกับ
> การสร้าง task · คู่กับ unique เต็มบน `(project_id, number)` ที่ `task.tasks`

**`archived_at` ไม่ใช่ `deleted_at`** — archive คือซ่อน ข้อมูลยังอ่านได้ครบและสมาชิกยังเข้าถึงประวัติได้
จึงไม่เข้าคู่กับ `deleted_by` และไม่มี CHECK ผูก ([base entity](./rules.md#base-entity))

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

  -- partial ทั้งสองเงื่อนไข: ตารางนี้ soft delete จึงต้องมี deleted_at ด้วย (🔒)
  CREATE UNIQUE INDEX ON project.statuses (project_id)
    WHERE is_default AND deleted_at IS NULL;
  CREATE UNIQUE INDEX ON project.statuses (project_id, name)
    WHERE deleted_at IS NULL;

sprints                                          (Phase 2)
  project_id          uuid  FK
  name                text
  goal                text  null
  start_date          date         วันที่ล้วน ไม่มีเวลา
  end_date            date         วันที่ล้วน ไม่มีเวลา
  status              text  'planned' | 'active' | 'completed'
  sort_order          text COLLATE "C"

  CHECK (status IN ('planned', 'active', 'completed'))
  CHECK (end_date >= start_date)
  CREATE UNIQUE INDEX ON project.sprints (project_id)
    WHERE status = 'active' AND deleted_at IS NULL;
```

## Schema `task`

```
tasks
  project_id          uuid       FK → project.projects
  title               text
  description         text       null
  number              int        เลขต่อ project เริ่มที่ 1 · แจกจาก projects.next_task_number
                                 sub-task มีเลขของตัวเอง ไม่ใช่ 120.1
  status_id           uuid       FK → project.statuses
  priority            text       'low' | 'medium' | 'high' | 'urgent' | null
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

  -- 🔒 unique เต็ม ไม่ใช่ partial — ตั้งใจแหกกฎ soft-delete ดูด้านล่าง
  CREATE UNIQUE INDEX ON task.tasks (project_id, number);
  CREATE INDEX ON task.tasks (org_id, project_id, status_id);
  CREATE INDEX ON task.tasks (org_id, parent_task_id);
  CREATE INDEX ON task.tasks (org_id, sprint_id);
  CREATE INDEX ON task.tasks USING gin (custom_fields);   -- Phase 4

assignees
  task_id             uuid  FK
  assignee_type       text  'user' | 'team'
  assignee_id         uuid  ชี้ไป identity.users หรือ organization.teams ตาม type (ไม่มี FK)
  UNIQUE (task_id, assignee_type, assignee_id)   -- assigned_at คือ created_at

dependencies                                     -- Phase 5 · คู่กับ Gantt
  predecessor_id      uuid  FK → task.tasks      -- ต้องเสร็จก่อน
  successor_id        uuid  FK → task.tasks      -- ถึงจะเริ่มได้
  type                text  'finish_to_start'    -- แบบเดียวพอ ดูด้านล่าง

  UNIQUE (org_id, predecessor_id, successor_id)
  CHECK  (predecessor_id <> successor_id)        -- งานรอตัวเองไม่ได้

  FOREIGN KEY (predecessor_id, org_id) REFERENCES task.tasks (id, org_id) ON DELETE CASCADE
  FOREIGN KEY (successor_id,   org_id) REFERENCES task.tasks (id, org_id) ON DELETE CASCADE

  CREATE INDEX ON task.dependencies (org_id, successor_id);    -- "งานนี้รออะไรอยู่"
  CREATE INDEX ON task.dependencies (org_id, predecessor_id);  -- "เลื่อนอันนี้แล้วใครกระทบ"

task_embeddings                                  -- Phase 5 · semantic search + ตรวจงานซ้ำ
  task_id             uuid  FK → task.tasks · ON DELETE CASCADE · UNIQUE (หนึ่งงานหนึ่งเวกเตอร์)
  embedding           vector    -- ต้องมี extension pgvector ก่อน ดูด้านล่าง
  updated_at          timestamptz
  -- index แบบ HNSW/IVFFlat ค่อยเลือกตอนรู้จำนวนแถวจริง ไม่ต้องตัดสินตอนนี้
```

> ⚠️ **`vector` ไม่ใช่ type ที่ Postgres มีมาให้ — ต้องมี extension `pgvector` ก่อน**
> `CreateExtensions` ตอนนี้มีแค่ `citext` · และต่างจาก `citext` ตรงที่ **image
> `postgres:18-alpine` ที่ใช้อยู่ไม่มีไฟล์ของ pgvector ติดมาด้วย** `CREATE EXTENSION`
> จึงล้มด้วย _"could not open extension control file"_ ไม่ว่าจะเป็น role ไหน
> · ต้องเปลี่ยน image (เช่น `pgvector/pgvector`) หรือ build เอง = **งานฝั่ง deploy
> ไม่ใช่แค่เพิ่มบรรทัดใน migration** — ต้องรู้ก่อนถึง Phase 5 ไม่ใช่ตอนนั้น

> 🔒 **`UNIQUE (project_id, number)` เป็น index เต็ม ไม่ใช่ partial** — เป็นข้อยกเว้นเดียวของกติกา
> "unique ของตารางที่ soft delete ต้องเป็น partial" ([rules](./rules.md)) และตั้งใจแหก
>
> เหตุผลกลับด้านกับกติกาเดิม: partial มีไว้ให้**ใช้ชื่อเดิมซ้ำได้**หลังลบ แต่เลขงานต้องไม่ถูกแจกซ้ำ
> คนแปะ `DEV-87` ไว้ในแชทหรือในเอกสาร แล้ววันหนึ่งเลขนั้นไปโผล่บนงานคนละใบ คือความเสียหาย
> ที่ย้อนไม่ได้ · index เต็มบวก `next_task_number` ที่เดินหน้าอย่างเดียวทำให้เลขที่แจกไปแล้ว
> ตายไปกับงานนั้น

**`UNIQUE` ธรรมดา ไม่ใช่ partial** เพราะตารางนี้ไม่ soft delete — ผูกกับเลิกผูกคือความสัมพันธ์เปลี่ยน ไม่ใช่ข้อมูลถูกทำลาย เอากลับมาก็แค่ผูกใหม่ ([base entity](./rules.md#base-entity) กลุ่มที่สี่) · ใครเลิกผูกเมื่อไหร่อยู่ใน `audit.logs` อยู่แล้ว

**composite FK ทั้งสองขาคือหัวใจ** — บังคับให้ทั้ง predecessor และ successor แชร์ `org_id` ค่าเดียวกันของแถวนี้ → ผูกงานข้าม org ไม่ได้ในระดับ database ไม่ต้องมี trigger ([เหตุผลเต็ม](./rules.md#เกณฑ์นี้ไม่ใช่-หา-org-จากแม่ได้มั้ย))

**กัน cycle ต้องเช็คตอน insert ด้วย recursive CTE** — `A → B → A` FK กันไม่ได้ และ `CHECK` ก็กันได้แค่ชั้นเดียว

```sql
WITH RECURSIVE reachable AS (
  SELECT successor_id FROM task.dependencies
   WHERE org_id = $1 AND predecessor_id = $successor      -- เริ่มจากปลายทางที่จะเพิ่ม
  UNION
  SELECT d.successor_id FROM task.dependencies d
    JOIN reachable r ON d.predecessor_id = r.successor_id
   WHERE d.org_id = $1
)
SELECT 1 FROM reachable WHERE successor_id = $predecessor  -- เจอ = จะเกิด cycle
```

**เตือน ไม่บล็อก** — ห้ามกันไม่ให้เปลี่ยน status ของ successor ทั้งที่ predecessor ยังไม่เสร็จ ให้ขึ้นเตือนแทน · หลักเดียวกับ prompt ตอนปิด parent ที่ยังมี sub-task ค้าง

**เริ่มจาก `finish_to_start` อย่างเดียว** — SS/FF/SF ของ MS Project แทบไม่มีใครใช้ · คอลัมน์ `type` มีไว้ให้เพิ่มทีหลังโดยไม่ต้อง migrate

## Schema `audit`

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

## Schema `discussion`

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

## Schema `field` (Phase 4)

```
definitions
  project_id          uuid  FK
  name                text
  type                text  'text' | 'date' | 'number' | 'select'
  config_json         jsonb  เช่น ตัวเลือกของ select
  sort_order          text COLLATE "C"
  -- ค่าเก็บใน task.tasks.custom_fields (jsonb) ไม่มีตารางเก็บค่าแยก
```

## Schema `view` (Phase 4)

```
views
  project_id          uuid  FK
  name                text
  type                text  'list' | 'board' | 'calendar'   -- ไม่มี 'table' ตัดไปแล้ว
  owner_id            uuid  null = view กลางของ project · มีค่า = view ส่วนตัว
                            FK → identity.users · ON DELETE CASCADE (ดูด้านล่าง)
  filter_json         jsonb  default '{}'
  sort_json           jsonb  default '[]'   -- array: เรียงหลายชั้นตามลำดับ ไม่ใช่ object
  group_by            text   null
  sort_order          text COLLATE "C"      -- ลำดับแท็บ view
  is_default          boolean default false -- view ที่เปิดมาเจอก่อน · 1 project 1 อัน
  CREATE UNIQUE INDEX ON view.views (project_id)
    WHERE is_default AND owner_id IS NULL AND deleted_at IS NULL;

columns
  view_id             uuid  FK
  column_type         text  'builtin' | 'custom_field'
  column_key          text  'status' | 'assignee' | <field UUID>
  sort_order          text COLLATE "C"
  width               int   null
  is_visible          boolean
```

> ⚠️ **`views.owner_id` เป็น `CASCADE` ที่ไม่มีวันทำงาน — กับดักตัวเดียวกับ [`oauth_accounts.user_id`](#schema-identity)**
>
> `identity.users` อยู่ใน [`NEVER_PURGED`](../../../apps/api/core/src/maintenance/retention.policy.ts) และการ anonymise เป็น `UPDATE` ไม่ใช่ `DELETE` · view ส่วนตัวของคนที่ลาออกจึงค้างอยู่ ต้องลบเองตอน anonymise
>
> ต่างจาก `oauth_accounts` ตรงที่นี่ไม่ใช่ช่องโหว่สิทธิ์ — เป็นแค่แถวที่ไม่มีเจ้าของ แต่ต้องรู้ว่า FK ไม่ได้เก็บกวาดให้

## Schema `chat` (Phase 4)

> 🔒 **ต้องทำ** — 1 `external_channel_id` ผูกได้ org เดียว (unique index) กันข้อความข้ามบริษัท

```
identities
  user_id             uuid  FK
  platform            text  CHECK (platform IN ('discord','line','teams'))
  external_id         text  user id ฝั่งนั้น — เป็นข้อมูลส่วนบุคคล ต้องล้างตอน anonymize
                            (เริ่มบังคับตอน Phase 4 ที่ตารางนี้เกิดจริง)
  linked_at           timestamptz
  UNIQUE (platform, external_id)

channels
  project_id          uuid  FK
  platform            text  CHECK (platform IN ('discord','line','teams'))
  external_channel_id text
  default_assignee_id uuid  null
  UNIQUE (platform, external_channel_id)   -- 1 ห้องผูกได้ org เดียว กันข้อมูลข้ามบริษัท
```

**`platform` ทั้งสองตัวต้องมี `CHECK`** ([เกณฑ์](./README.md#check-vs-enum)) — มันเป็นคอลัมน์นำของ unique index ทั้งคู่ ค่าที่พิมพ์ผิดจึงไม่ error แต่ไปอยู่คนละ bucket

ของ `channels` หนักที่สุดในระบบ เพราะ `UNIQUE (platform, external_channel_id)` **คือกลไกเดียว**ที่บังคับ 🔒 ข้างบน — `'discord'` กับ `'Discord'` เป็นคนละคีย์ แปลว่าห้องเดียวลงทะเบียนได้สอง org แล้วข้อความข้ามบริษัททันที · เพิ่มค่าใหม่ทีหลัง (Teams มา Phase 6) เป็น integration ที่มี migration ของตัวเองอยู่แล้ว `DROP CONSTRAINT` หนึ่งบรรทัดจึงไม่ใช่ต้นทุน

## Schema `automation` (Phase 5)

> ⚠️ schema นี้ยังไม่ถูกสร้าง — `CreateSchemas` สร้าง 11 อันและไม่มี `automation`
> ต้องเพิ่มเข้าไปให้ครบตามหลัก "หนึ่ง schema ต่อหนึ่ง module สร้างล่วงหน้าทั้งหมด"
> (`reset.ts` กับ `test/database.ts` ต้องตามด้วย)

```
rules
  project_id        uuid     FK → project.projects
  name              text
  is_enabled        bool     default true
  trigger_type      text     ดูตารางด้านล่าง · ไม่ใส่ CHECK (ค่าโตตามฟีเจอร์)
  conditions_json   jsonb    default '{}'
  actions_json      jsonb    NOT NULL

  FOREIGN KEY (project_id, org_id) REFERENCES project.projects (id, org_id) ON DELETE CASCADE
  CREATE INDEX ON automation.rules (org_id, project_id, trigger_type) WHERE is_enabled;
```

ใช้ base entity เต็มชุด (soft delete + แก้ได้) — rule เป็นของที่คนเขียนเอง ลบผิดแล้วอยากได้คืน เหมือน project

**Trigger มีสองชนิด ไม่ใช่ลิสต์เดียว** — จุดที่พลาดง่ายที่สุดของฟีเจอร์นี้

| ชนิด | มาจาก | ตัวอย่าง |
| --- | --- | --- |
| **เหตุการณ์** | event emitter หลัง commit | `task.created` · `task.assigned` · `task.completed` (มีแล้ว) · `task.status_changed` (**ต้องเพิ่ม**) |
| **เวลา** | cron ใน [`src/maintenance/`](../../../apps/api/core/src/maintenance/) | "เลย due date 2 วัน" · "ใกล้ครบกำหนดพรุ่งนี้" |

ชนิดที่สอง **ไม่มีใคร emit** — ไม่มีการกระทำของผู้ใช้ให้ยิง มีแต่เวลาที่เดินผ่านไป · `due_soon` ที่เห็นใน `notify.outbox.template` เป็น _ปลายทาง_ ของ noti ไม่ใช่ trigger

> 🔒 **action ของ automation ต้องเดินผ่าน outbox ไม่ใช่ listener เปล่า**
>
> emitter ยิงหลัง commit แบบ fire-and-forget — listener ที่พังทำให้งานหายเงียบ ไม่มี error ที่ไหน **เหตุผลเดียวกับที่ audit ห้ามใช้ emitter** ([ทำไม](../01-architecture.md#how-the-activity-log-is-written))
>
> ตอนนี้ยังไม่เจ็บเพราะ consumer เดียวคือ notification ซึ่งมี outbox + retry รองรับ · แต่ automation **เขียนข้อมูล** — automation ที่พังเงียบแปลว่างานไม่ถูก assign โดยไม่มีใครรู้ ต่างจากอีเมลไม่ถึงที่คนทักมาเอง

**กันลูป: นับความลึก สูงสุด 3 ชั้น** — rule A เปลี่ยน status → trigger rule B → เปลี่ยนกลับ → trigger A

เลือกนับความลึกแทน "action จาก automation ไม่ trigger ตัวอื่น" เพราะ chain คือประโยชน์ครึ่งหนึ่งของฟีเจอร์ (`→ รอตรวจ` แล้ว `→ assign QA` แล้ว `→ แจ้งเข้าห้อง`) · พา depth ไปกับ event payload แล้วตัดที่ 3

ทุกครั้งที่ automation ทำงานต้องลง `audit.logs` โดย `actor_id` = [`SYSTEM_USER_ID`](../../../apps/api/core/src/shared/system-user.ts) พร้อมระบุ rule id ใน `changes_json` — ไม่งั้นจะมีการเปลี่ยนแปลงที่ไม่มีใครรับผิดชอบ

## Schema `notify`

```
notifications                                    (Phase 3) -- กล่องขาเข้าในเว็บ
  recipient_id        uuid
  type                text   'assigned' | 'mentioned' | 'comment' | 'status_changed'
                             | 'due_soon' | 'stale'
  actor_id            uuid   null · null = ระบบเป็นคนทำ (cron เตือนใกล้ครบกำหนด)
  entity_type         text   'task' | 'comment' | ...
  entity_id           uuid   ไม่มี FK (polymorphic เหมือน audit.logs)
  payload_json        jsonb  default '{}' · ข้อความสำเร็จรูปพอให้แสดงได้โดยไม่ต้อง join
  read_at             timestamptz null

  CREATE INDEX ON notify.notifications (org_id, recipient_id, created_at DESC);
  -- ตัวนับเลข unread บนกระดิ่ง
  CREATE INDEX ON notify.notifications (org_id, recipient_id)
    WHERE read_at IS NULL;

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

**`notifications` แยกจาก `outbox` เพราะเป็นคนละอายุและคนละคำถาม**

| | `notifications` | `outbox` |
| --- | --- | --- |
| ตอบคำถาม | อ่านหรือยัง | ส่งถึงหรือยัง |
| ใครดู | ผู้ใช้ | worker |
| อายุ | อยู่จนกว่า retention จะเก็บ | ลบทิ้งหลังส่งสำเร็จ |

ใช้ `outbox` เป็นกล่องขาเข้าไม่ได้ เพราะ retention **ลบแถว outbox ทิ้งจริง** ประวัติแจ้งเตือน
จะหายตามรอบ · และ `status='sent'` แปลว่าอีเมลออกไปแล้ว ไม่ได้แปลว่าคนเปิดอ่าน

ทั้งสองตารางเขียนในทรานแซกชันเดียวกับ business logic เหมือนกัน — เหตุการณ์หนึ่งครั้งลงได้ทั้งคู่
(แจ้งในเว็บ + ส่งอีเมล) หรือลงแค่ตัวใดตัวหนึ่ง

**ไม่ soft delete ทั้งคู่** — `read_at` ไม่ใช่ตัวบอกการลบ และ retention เก็บกวาดด้วย hard delete
อยู่แล้ว ([ทำไมตารางบางตัวไม่มี `deleted_at`](./rules.md#base-entity))

## Schema `billing` — Empty Tables, Reserved for Later

สร้างตารางไว้ใน Phase 0 แต่**ไม่มีโค้ดแตะจนกว่าจะถึง Phase 7** · รายละเอียดอยู่ใน [`05-saas-notes.md`](../05-saas-notes.md)

```
plans           (id, name, max_users, price_monthly, price_yearly,
                 ai_multiplier, ai_daily_limit, features_json)

subscriptions   (id, org_id, plan_id, status, current_period_end, seats_used)

ai_wallet       (id, org_id, source, units_granted, units_used,
                 period_key, expires_at)

ai_usage        (org_id, user_id, period_day, period_week,
                 tokens_in, tokens_out, feature)
```
