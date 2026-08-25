# Database

ทุกตารางในระบบ พร้อมฟิลด์ · กติกา FK · การแยกข้อมูลตาม org

> [← Overview](../00-overview.md) · เกี่ยวข้อง: [`01-architecture.md`](../01-architecture.md)

## Contents

เอกสารนี้แยกเป็นสามส่วน ตามวิธีที่ถูกใช้จริง — กติกาอ่านตั้งแต่ต้นจนจบ ส่วนตารางเปิดหาทีละอัน

| ไฟล์ | มีอะไร | เปิดเมื่อ |
| --- | --- | --- |
| **[`rules.md`](./rules.md)** 🔒 | [Foreign Key Rules](./rules.md#foreign-key-rules) · [Multi-tenancy](./rules.md#multi-tenancy) · [Base Entity](./rules.md#base-entity) · [กฎ `org_id`](./rules.md#the-org_id-rule--one-test-not-a-list) | กำลังจะเขียน migration หรือ entity ใหม่ |
| **[`schema.md`](./schema.md)** | ทุกตาราง ทุกฟิลด์ ทั้ง 12 schema | อยากรู้ว่าตารางไหนมีคอลัมน์อะไร |
| ที่นี่ | [Schema Map](#schema-map) · [Other Notes](#other-notes) | อยากรู้ว่าตารางไหนอยู่ schema ไหน |

---

## Schema Map

| Schema         | ตาราง                                                                                    | Module          |
| -------------- | ---------------------------------------------------------------------------------------- | --------------- |
| `identity`     | users, sessions, password_reset_tokens, roles, permissions, role_permissions, user_roles · oauth_accounts _(ยังไม่สร้าง)_ | `identity/`     |
| `organization` | organizations, members, teams, team_members                                              | `organization/` |
| `project`      | projects, members, statuses, sprints                                                     | `project/`      |
| `task`         | tasks, assignees · dependencies _(Phase 5)_                                              | `task/`         |
| `audit`        | logs                                                                                     | `audit/`        |
| `discussion`   | comments, attachments _(Phase 3)_                                                        | `discussion/`   |
| `field`        | definitions _(Phase 4)_                                                                  | `field/`        |
| `view`         | views, columns _(Phase 4)_                                                               | `view/`         |
| `chat`         | identities, channels _(Phase 2)_                                                         | `chat/`         |
| `automation`   | rules _(Phase 5)_                                                                        | `automation/`   |
| `notify`       | outbox                                                                                   | `notify/`       |
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

