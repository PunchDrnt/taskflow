# Database

ทุกตารางในระบบ พร้อมฟิลด์ · กติกา FK · การแยกข้อมูลตาม org

> [← Overview](../00-overview.md) · เกี่ยวข้อง: [`01-architecture.md`](../01-architecture.md)

## Contents

เอกสารนี้แยกเป็นสามส่วน ตามวิธีที่ถูกใช้จริง — กติกาอ่านตั้งแต่ต้นจนจบ ส่วนตารางเปิดหาทีละอัน

| ไฟล์ | มีอะไร | เปิดเมื่อ |
| --- | --- | --- |
| **[`rules.md`](./rules.md)** 🔒 | [Foreign Key Rules](./rules.md#foreign-key-rules) · [Multi-tenancy](./rules.md#multi-tenancy) · [Base Entity](./rules.md#base-entity) · [กฎ `org_id`](./rules.md#the-org_id-rule--one-test-not-a-list) | กำลังจะเขียน migration หรือ entity ใหม่ |
| **[`schema.md`](./schema.md)** | ทุกตาราง ทุกฟิลด์ ทุก schema | อยากรู้ว่าตารางไหนมีคอลัมน์อะไร |
| ที่นี่ | [Schema Map](#schema-map) · [Other Notes](#other-notes) | อยากรู้ว่าตารางไหนอยู่ schema ไหน |

---

## Schema Map

| Schema         | ตาราง                                                                                    | Module          |
| -------------- | ---------------------------------------------------------------------------------------- | --------------- |
| `identity`     | users, sessions, password_reset_tokens, roles, permissions, role_permissions, user_roles · oauth_accounts _(ยังไม่สร้าง)_ | `identity/`     |
| `organization` | organizations, members, invitations, teams, team_members                                 | `organization/` |
| `project`      | projects, members, statuses, sprints                                                     | `project/`      |
| `task`         | tasks, assignees · dependencies, task_embeddings _(Phase 5)_                             | `task/`         |
| `audit`        | logs                                                                                     | `audit/`        |
| `discussion`   | comments, attachments _(Phase 3)_                                                        | `discussion/`   |
| `field`        | definitions _(Phase 4)_                                                                  | `field/`        |
| `view`         | views, columns _(Phase 4)_                                                               | `view/`         |
| `chat`         | identities, channels _(Phase 4)_                                                         | `chat/`         |
| `automation`   | rules _(Phase 5)_ · ⚠️ **`CreateSchemas` ยังไม่ได้สร้าง schema นี้**                          | `automation/`   |
| `notify`       | notifications _(Phase 3)_, outbox                                                        | `notify/`       |
| `billing`      | plans, subscriptions, ai_wallet, ai_usage _(ตารางว่าง เผื่ออนาคต)_                          | —               |
| `public`       | extension + `migrations` (สมุดบันทึกของ TypeORM CLI) เท่านั้น — ห้ามมีตารางของ module            | —               |

**หลักการตั้งชื่อ**

- Schema ตั้งตาม domain · **ไม่ย่อ** · เอกพจน์
- ชื่อตารางไม่ซ้ำคำกับ schema — `chat.identities` ไม่ใช่ `chat.chat_identities`
- ข้อยกเว้นเดียวที่ย่อคือ **คอลัมน์ `org_id`** เพราะโผล่ในทุกตาราง ทุก query ทุก index

TypeORM กำหนดที่ entity: `@Entity({ schema: 'task', name: 'tasks' })`

## Other Notes

- Migration แยกไฟล์ตาม module ตั้งชื่อมี prefix module
- แยก DB user ตาม schema — อย่างน้อย**ห้ามใช้ superuser รัน app**
- อย่าแยกเป็นคนละ database (จะเสีย transaction ข้าม module)
- Connection pool ตัวเดียวพอ

### CHECK vs enum

**ไม่ใช้ `enum` type ของ Postgres ที่ไหนเลย** — เพิ่มค่าใหม่ต้องแยก migration สองรอบ (ค่าที่เพิ่งเพิ่มใช้ใน transaction เดียวกันไม่ได้) ลบค่าต้องสร้าง type ใหม่ทั้งตัว · ใช้ `text` ธรรมดา แล้วใส่ `CHECK` เอาถ้าจำเป็น — แก้ทีหลังแค่ drop constraint แล้ว add ใหม่

**เกณฑ์เดียว: ใส่ `CHECK` ก็ต่อเมื่อค่าที่พิมพ์ผิดทำให้ _constraint อื่น_ เงียบๆ ไม่ทำงาน**

ค่าที่พิมพ์ผิดในคอลัมน์ธรรมดาคือข้อมูลผิดหนึ่งแถว — แอปเจอเองตอนอ่าน · แต่ถ้ามี index พึ่งค่านั้นอยู่ **insert จะผ่าน ไม่มี error และข้อจำกัดที่ตั้งใจไว้หายไปโดยไม่มีใครรู้** · มีสองรูปแบบ

| รูปแบบ | ค่าผิดแล้วเกิดอะไร | ตอนนี้มี |
| --- | --- | --- |
| **partial index พึ่ง _ค่า_ นั้น** | แถวหลุดออกจาก index ไปเลย | `users.status` (unique email `WHERE status != 'deleted'`) · `sprints.status` (unique `(project_id) WHERE status = 'active'`) · `outbox.status` (คิว worker `WHERE status = 'pending'`) |
| **unique index ที่มีคอลัมน์นั้นเป็นส่วนประกอบ** | ค่าผิดไปอยู่คนละ bucket — uniqueness ไม่ครอบอีกต่อไป | `oauth_accounts.provider` — `('google', sub)` กับ `('Google', sub)` เป็นคนละคีย์ **= Google account เดียวถูกอ้างโดยสอง user ได้ ซึ่งคือช่องยึดบัญชี** |

**ห้ามใส่** ถ้าไม่เข้าสองแบบข้างบน **และ** การเพิ่มค่าใหม่ไม่ต้องมี migration อยู่แล้ว — `CHECK` จะเปลี่ยนงานที่ไม่ต้องแตะ DB เลยให้กลายเป็น migration แถมทุกครั้ง และถ้าคอลัมน์นั้นอยู่ใน `audit.logs` ซึ่ง partition รายเดือนและไม่เคยลบ `VALIDATE` จะแพงขึ้นเรื่อยๆ ไม่มีวันถูกลง
_ตัวอย่าง:_ `audit.logs.entity_type` · `audit.logs.action` · `discussion.comments.entity_type` · `notify.outbox.template` · `view.columns.column_key` · `automation.rules.trigger_type` _(Phase 5)_ — ทุกตัวเพิ่มค่าใหม่ได้ด้วยการเขียนโค้ดอย่างเดียว

> **"ค่าโตตามฟีเจอร์" อย่างเดียวไม่ใช่เหตุผลห้าม** — `oauth_accounts.provider` ก็โต (`'line'` ทีหลัง) แต่การเพิ่ม provider คือการต่อ integration ใหม่ที่มี migration ของตัวเองอยู่แล้ว `DROP CONSTRAINT` หนึ่งบรรทัดจึงไม่ใช่ต้นทุน · ต่างจาก `audit.logs.action` ที่เพิ่มค่าใหม่ทุกฟีเจอร์โดยไม่ต้องแตะ DB เลย

_ที่ไม่เข้าเกณฑ์ ปล่อยเป็น `text` ให้ application คุม:_ `role` · `priority` · `type` ฯลฯ — เพิ่ม `CHECK` ทีหลังได้ตลอดถ้าเจอปัญหาจริง

**สามคอลัมน์ที่เข้าเกณฑ์แถวที่สอง** — เกณฑ์เดิมเขียนครอบแค่ partial index จึงมองข้ามไปทั้งสามตัว

| คอลัมน์ | unique index ที่พึ่งมัน | ค่าผิดแล้ว |
| --- | --- | --- |
| `chat.channels.platform` | `(platform, external_channel_id)` | 🔒 **"1 `external_channel_id` ผูกได้ org เดียว" ถูกข้าม** — ห้องเดียวลงทะเบียนได้สอง org = ข้อความข้ามบริษัท |
| `chat.identities.platform` | `(platform, external_id)` | คนเดียวผูกได้สองแถวในแพลตฟอร์มเดียวกัน |
| `task.assignees.assignee_type` | `(task_id, assignee_type, assignee_id)` | เป็น discriminator ของ polymorphic ที่**ไม่มี FK** — ค่าผิดแปลว่า `assignee_id` ถูกไปหาในตารางผิด (`users` แทน `teams`) |

> ⚠️ **`schema-drift.spec.ts` มองไม่เห็น `CHECK`** — มันเทียบคอลัมน์ ไม่ใช่ constraint · CHECK ที่หายไปจึงไม่มีอะไรฟ้อง `test/schema-invariants.spec.ts` เลยยืนยันสามตัวนี้แทน

เกณฑ์ข้างบนใช้กับ `CHECK` ที่จำกัด**ชุดค่า**ของคอลัมน์เดียวเท่านั้น · อีกสองชนิดเป็นคนละเรื่อง ใส่ได้ตามที่จำเป็น ไม่ต้องเข้าเกณฑ์นี้:

- **invariant ข้ามคอลัมน์** เช่น `identity.users` ที่บังคับ `password_hash IS NULL` เมื่อ `is_system`
  · หรือ `deleted_at`/`deleted_by` ที่ต้องตั้งพร้อมกัน
- **รูปแบบของค่า** ไม่ใช่ชุดของค่า เช่น `project.projects.key_prefix ~ '^[A-Z][A-Z0-9]{1,5}$'`
  — ค่าที่ผิดรูปไม่ได้ทำให้ index ไหนเงียบ แต่ไปโผล่บนหน้าจอผู้ใช้เป็น task key ที่อ่านแล้วงง
  (`dev-87` ปนกับ `DEV-87`) และไม่มีทางแก้ย้อนหลังโดยไม่เปลี่ยน key ของงานเก่า

> ⚠️ `CHECK` ใน DB กับ union type ใน `@repo/shared` ไม่มีอะไร sync ให้ — แก้ที่ไหนต้องแก้อีกที่ด้วย

---

