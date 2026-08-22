# Feature Specifications

รายละเอียดของแต่ละ feature · ลำดับหัวข้อในแต่ละ phase ตรงกับตารางใน [`03-roadmap.md`](./03-roadmap.md)

> [← Overview](./00-overview.md)

## Contents

- [Phase 0 — Foundation `v0.1.0`](#phase-0--foundation-v010)
- [Phase 1 — First Real Users `v1.0.0`](#phase-1--first-real-users-v100)
- [Phase 2 — Team + Sub-task + Sprint + Chat `v1.1.0`](#phase-2--team--sub-task--sprint--chat-v110)
- [Phase 3 — Collaboration `v1.2.0`](#phase-3--collaboration-v120)
- [Phase 4 — Custom Fields, Views, Reports, Estimates `v1.3.0`](#phase-4--custom-fields-views-reports-estimates-v130)
- [Phase 5 — Advanced Features + Semantic Search `v2.0.0`](#phase-5--advanced-features--semantic-search-v200)
- [Phase 6 — Polish `v2.1.0`](#phase-6--polish-v210)

**Phase 7-8 (SaaS, billing, AI ที่ใช้ LLM)** → [`05-saas-notes.md`](./05-saas-notes.md) — ยังไม่ commit

---

### Phase 0 — Foundation `v0.1.0`

ไม่มีฟีเจอร์ให้ใช้ แต่เป็นฐานทั้งหมด

- Setup monorepo (Yarn 4 Berry + Turborepo)
- Docker compose ครบ (api, web, postgres, postgres-test, garage, caddy) — ตอนนี้มี postgres + postgres-test + garage
- **สร้าง schema ครบทุก module ตั้งแต่รอบนี้** — รวม `sprints` + `tasks.sprint_id` + `tasks.estimate` ด้วย (เติมทีหลังต้อง migrate `tasks` ซึ่งเป็นตารางใหญ่สุด)
  - ข้อยกเว้นเดียว: `chat.identities` / `chat.channels` สร้างตอน Phase 2 — เป็นตารางอิสระ ไม่มีใครชี้มาหา
- Base entity — UUID, `org_id`, `created_at/by`, `updated_at/by`, `deleted_at/by` · วันเวลาใช้ `timestamptz` ทั้งหมด ([schema เต็ม](./02-database.md#base-entity--on-every-table-with-four-named-exceptions))
- `users.status` เป็น string ('active' | 'deactivated' | 'pending_deletion' | 'deleted') + unique index อีเมลแบบ partial
- Global `org_id` scoping — **repository base class + isolation test** ([วิธี implement](./01-architecture.md#org_id-scoping)) · **RLS เลื่อนไป Phase 2** เพราะ `CREATE POLICY` เพิ่มทีหลังได้โดยไม่ต้อง migrate
- Migration เขียนมือทั้งหมด · `synchronize: false` ถาวร — `synchronize` สร้าง partition, partial index, `COLLATE "C"` และ extension ให้ไม่ได้
- **Seed system user เป็น migration แรก** — base entity บังคับ `created_by NOT NULL` ทุกตารางรวม `identity.users` เอง แถวแรกจึงต้อง insert โดยชี้ `created_by` มาที่ id ของตัวเอง (Postgres ทำได้ใน INSERT เดียว แต่ต้องตั้งใจวางลำดับ)
- Permission layer `can(user, action, resource)` (CASL) โครงเปล่า
- Activity log service — **เขียน audit row ใน transaction เดียวกับ business logic** ไม่ผ่าน event emitter ([เหตุผล](./01-architecture.md#how-the-activity-log-is-written)) · event emitter ใช้กับ notification เท่านั้น
- `StorageService` ห่อ Garage (S3) — [ทำไมไม่ใช่ MinIO](./01-architecture.md#object-storage)
- `EmailService` ห่อ Resend + outbox worker
- CI/CD + **deploy ขึ้น Bangmod ให้ได้จริง**
- Error tracking (Sentry)
- Seed script สำหรับ dev/demo
- ตาราง RBAC ระดับระบบ (`identity.roles`, `permissions`, `role_permissions`, `user_roles`) + seed permission keys — **ไม่มีโค้ดอ่าน** back-office มา Phase 7 ([ลำดับชั้นสิทธิ์](./01-architecture.md#permission-hierarchy))

> deploy pipeline ที่ทำทีหลังมักกลายเป็นคอขวด — ต้องได้ deploy จริงตั้งแต่ Phase 0 แม้จะเป็นหน้าเปล่า

---

### Phase 1 — First Real Users `v1.0.0`

#### Auth & Users

- Login / Logout (JWT + refresh token rotation — ดูรายละเอียดใน [`01-architecture.md`](./01-architecture.md#auth))
- ลืมรหัสผ่าน (ลิงก์ทางอีเมล อายุ 10 นาที)
- เปลี่ยนรหัสผ่าน (ต้องใส่รหัสเดิม)
- โปรไฟล์: ชื่อจริง, **ชื่อเล่น**, อีเมล, รูป
- แก้ไขโปรไฟล์ / เปลี่ยนรหัสผ่าน

**ไม่มี public register ใน Phase 1** — endpoint `/register` มีอยู่ แต่ดักด้วย `FeatureService.isEnabled(org, 'public_registration')` ซึ่ง return `false` ตั้งแต่บรรทัดแรก

> ถ้าเปิดสมัครเสรี ใครที่รู้ URL ก็เข้าถึงข้อมูลบริษัทได้ทันที เพราะ Phase 1 มี org เดียว
>
> นี่เป็นการใช้งานจริงครั้งแรกของ `FeatureService` — ไม่ต้องรอ Phase 7

**สร้าง user ช่วงแรก:** ยิง admin API ด้วย Postman หรือ seed script · หน้าจอจัดการ user มา Phase 2

> ชื่อเล่นจำเป็น — คนไทยเรียกชื่อเล่นเป็นหลัก ค้นด้วยชื่อจริงอย่างเดียวจะหาไม่เจอ

**Email unique ระดับทั้งระบบ** — 1 อีเมล = 1 account แล้วคนนั้นเข้าได้หลาย org ผ่าน `organization.members`

```sql
CREATE UNIQUE INDEX ON identity.users (email)
  WHERE status != 'deleted';
```

- คอลัมน์เป็น `citext` อยู่แล้ว → `A@x.com` กับ `a@x.com` ชนกันเอง ไม่ต้องพันด้วย `lower()` ซ้ำ
- `WHERE status != 'deleted'` — อีเมลยังถูกจองไว้ตลอดช่วง grace period 30 วัน ไม่ให้คนอื่นแย่งไปสมัครแล้วเจ้าตัวกู้คืนไม่ได้ · หลัง anonymize แล้วอีเมลนั้นสมัครใหม่ได้ (เป็น account ใหม่คนละใบ)

#### Organization

- สร้าง org อัตโนมัติตอน setup (ยังไม่มีหน้าจอจัดการ)
- ข้อมูลทั้งหมดผูกกับ org
- Role ระดับ org: `owner` / `admin` / `member`

**Owner มีได้หลายคน** (โมเดลแบบ GitHub) — ไม่ใช่ Primary Owner คนเดียวแบบ Slack

- ห้ามลบหรือลดสิทธิ์ **owner คนสุดท้าย** — org ต้องมี owner อย่างน้อย 1 คนเสมอ
- Owner ทำได้ทุกอย่างที่ admin ทำ + ลบ org + แต่งตั้ง owner คนอื่น
- UI แนะนำให้มี owner อย่างน้อย 2 คน

> เลือกโมเดลนี้เพราะปัญหา "owner หายไปแล้วไม่มีใครแก้อะไรได้" หายไปเองโดยไม่ต้องมี recovery flow หรือคนกลาง — ตอนใช้ภายในไม่มี support มารับเรื่องอยู่แล้ว
>
> GitHub แนะนำตรงๆ ว่าถ้ามี owner คนเดียว org อาจเข้าถึงไม่ได้ถ้าคนนั้นติดต่อไม่ได้

#### User States — Three Different Things

|                    | ใครกด       | เข้าระบบได้         | ยังอยู่ในรายชื่อ org   | ชื่อในงานเก่า     | Phase |
| ------------------ | ----------- | ----------------- | ----------------- | -------------- | ----- |
| **Deactivate**     | admin/owner | ✗                 | ✓ (ขึ้นว่า inactive) | ✓              | 1     |
| **Remove จาก org** | admin/owner | ✓ (แต่ไม่เห็น org นี้) | ✗                 | ✓              | 2     |
| **Delete account** | เจ้าตัวเท่านั้น  | ✗                 | ✗                 | ✓ ("ผู้ใช้ที่ถูกลบ") | 2     |

**ตัวอย่าง**

- พนักงานลาออก → **deactivate** (ยังเห็นชื่อในรายชื่อว่าเคยอยู่ กลับมาทำงานก็เปิดใหม่ได้)
- ฟรีแลนซ์จบสัญญา → **remove จาก org** (account เขายังใช้กับลูกค้าเจ้าอื่นได้ปกติ)
- ขอลบข้อมูลตาม PDPA → **delete account**

**Deactivate (Phase 1)**

- Assign งานใหม่ให้ไม่ได้
- งานที่ค้างอยู่กับเขายังอยู่ — ต้องมี **filter "งานของคนที่ inactive"** ใน list view ตั้งแต่ Phase 1 ไม่งั้นงานจะค้างโดยไม่มีใครเห็น (Handover mode เต็มรูปแบบอยู่ Phase 4)
- Reactivate ได้

#### Project

- สร้าง / แก้ไข / ลบ project
- Project member เข้าได้อิสระ ไม่ผูกกับทีม (แบบ Slack channel)

#### Status (Custom Per Project)

กำหนดชื่อ, สี, ลำดับได้เอง — สีเลือกจาก palette 8 สี เก็บเป็น **token ไม่ใช่ hex**

| Token    | ใช้สื่อ                | Tailwind (light) |
| -------- | ------------------- | ---------------- |
| `gray`   | ยังไม่เริ่ม / พัก        | slate-500        |
| `red`    | ติดปัญหา / blocked    | red-500          |
| `orange` | เร่งด่วน / รอแก้       | orange-500       |
| `yellow` | รอตรวจ / รอ approve | amber-500        |
| `green`  | เสร็จ / ผ่าน          | emerald-500      |
| `blue`   | กำลังทำ              | blue-500         |
| `purple` | รอคนอื่น / external   | violet-500       |
| `pink`   | อื่นๆ                 | pink-500         |

**Default ตอนสร้าง project ใหม่**

| ชื่อ          | สี     | is_default | is_done_type |
| ----------- | ----- | ---------- | ------------ |
| To do       | gray  | ✅         | —            |
| In progress | blue  | —          | —            |
| Done        | green | —          | ✅           |

**กติกา**

- 1 project มี `is_default` ได้แค่ 1 อัน (status ตั้งต้นของ task ใหม่)
- 1 project ต้องมี `is_done_type` อย่างน้อย 1 อัน
- `is_cancelled_type` — สถานะที่แปลว่า "ยกเลิก/ไม่ทำแล้ว" ไม่ใช่ "เสร็จ" (ใช้ตอนคำนวณ progress)
- status หนึ่งอันเป็นได้ทั้ง done และ cancelled ไม่ได้ — เลือกอย่างใดอย่างหนึ่งหรือไม่เป็นเลย
- ห้ามลบ status ที่ยังมี task ใช้อยู่ / ห้ามลบอันสุดท้าย
- `completed_at` / `completed_by` ต้องมีค่า **ก็ต่อเมื่อ** status ของ task นั้น `is_done_type` — บังคับที่ application เพราะเงื่อนไขข้ามตาราง (`tasks` ↔ `statuses`) ซึ่ง `CHECK` ทำไม่ได้ · ต้องคุม**สองทาง** ไม่ใช่ทางเดียว: ตอน task เปลี่ยน status (ข้อบน) และตอนมีคนแก้ `is_done_type` ของ status ที่มี task ใช้อยู่แล้ว — ทางหลังลืมง่ายกว่า เพราะคนแก้กำลังมองหน้าจอตั้งค่า project ไม่ได้มองงานสักใบ
- แสดงเป็น badge สีอ่อน + ตัวอักษรเข้ม **พร้อมชื่อเสมอ** (คนตาบอดสี ~8% ของผู้ชาย)

```
project.statuses
  name
  color               -- token จาก palette 8 สี ไม่ใช่ hex
  sort_order          -- LexoRank
  is_default          -- status ตั้งต้นของ task ใหม่
  is_done_type        -- นับเป็น "เสร็จ"
  is_cancelled_type   -- นับเป็น "ยกเลิก" — ตัดออกจากตัวหารของ progress
```

[ดู schema เต็ม](./02-database.md#schema-project)

#### Task

- สร้าง / แก้ไข / ลบ — Title, Description, Due date, Priority
- **Quick add** — พิมพ์ชื่องาน + Enter จบ ไม่บังคับ field อื่น

  ในหน้า My Tasks ที่ไม่ได้อยู่ใน project ไหน ให้มี dropdown เล็กๆ ข้างช่องพิมพ์:

  ```
  [📁 Marketing ▾] [พิมพ์ชื่องาน..............] ⏎
  ```

  - Default = project ที่เพิ่งสร้าง task ล่าสุด (เก็บใน user preference)
  - คนใหม่ที่ยังไม่เคยสร้าง → project แรกที่เป็นสมาชิก
  - ดีกว่า disable (เสียประโยชน์ของ quick add) และดีกว่าบังคับเลือกทุกครั้ง (เพิ่มแรงเสียดทานที่พยายามลด)

- Status จาก custom status ของ project
- **Assign ได้หลายคน** (เฉพาะ user — ทีมอยู่ Phase 2)
- จัดลำดับเอง (LexoRank)
- แสดง "เสร็จโดยใคร เมื่อไหร่" (`completed_by`, `completed_at`)
- **เปลี่ยนสถานะกลับจาก done → ไม่ done → `completed_by` / `completed_at` reset เป็น null** ปิดใหม่อีกครั้งก็บันทึกค่าใหม่ (ประวัติการปิด-เปิดอยู่ใน activity log อยู่แล้ว)

**Assignee picker** (สำคัญเมื่อบริษัทมีคน 100+)

- Type-ahead ค้นได้ทั้งชื่อจริง / ชื่อเล่น / อีเมล — ไม่ใช้ dropdown รายชื่อยาว
- เรียงลำดับก่อนผู้ใช้พิมพ์:
  1. คนที่อยู่ใน project นี้
  2. คนที่เพิ่ง assign ไปล่าสุด (5-10 คนล่าสุด — คำนวณจาก activity log)
  3. ที่เหลือทั้ง org
- Default เลือกได้เฉพาะคนใน project + ปุ่ม "ค้นหาทั้งองค์กร"
- เลือกคนนอก → ถามว่าเพิ่มเข้า project เลยไหม
- แสดง avatar + ชื่อ + ชื่อเล่น ในแต่ละแถว (กันเลือกผิดคน)
- Keyboard navigation: ลูกศร + Enter

#### Notifications

- ส่งอีเมลเมื่อถูก assign งาน

> ถ้าไม่มีแจ้งเตือนเลย คนจะไม่รู้ว่ามีงานมอบหมายมา แล้วจะไม่กลับเข้าระบบ

**Provider: Resend** — API สะอาด, ฟรี 3,000 ฉบับ/เดือน, ตั้ง domain ง่าย, ใช้ React Email เขียน template ในโค้ดเดียวกันได้

ห่อด้วย **`EmailService`** เหมือน `StorageService` — เปลี่ยน provider ทีหลังแก้จุดเดียว (ทางเลือกสำรอง: SES ถูกกว่าถ้าส่งเยอะ, Brevo, SMTP ของ Bangmod)

**Outbox pattern** (ใช้ `notify.outbox`)

```
1. บันทึกลง outbox ใน transaction เดียวกับ business logic
2. Worker อ่านแถวที่ยังไม่ส่ง → ส่ง → mark sent
3. ส่งไม่สำเร็จ → retry 3 ครั้ง (exponential backoff)
4. ครบ 3 ครั้ง → mark failed + แจ้ง Sentry
```

> ถ้าส่งอีเมลตรงใน request แล้ว provider ล่ม จะเสียทั้ง transaction หรือ assign สำเร็จแต่ไม่มีใครรู้

#### Views

- **List view** — รับ config คอลัมน์เป็น array จากที่เดียว (hard-code ไว้ก่อนได้) ไม่เขียน `<th>` ตายตัวใน JSX เพื่อให้ต่อ `view_columns` ใน Phase 4 ได้โดยแก้จุดเดียว
- Filter: คน, status, priority, วันที่, **งานของคนที่ inactive** (กันงานค้างโดยไม่มีใครเห็น)
- Search พื้นฐาน
- **My Tasks** — Phase 1 มีแค่งานที่ assign ให้ตัวเอง (ยังไม่มีทีม)

---

### Phase 2 — Team + Sub-task + Sprint + Chat `v1.1.0`

#### Remove From Org

- Owner/admin เอาคนออกจาก org ได้
- Account ของเขายังอยู่ ใช้กับ org อื่นได้ปกติ
- ชื่อยังแสดงในประวัติงานเก่าของ org นี้
- ถูกถอดออกจากทุก team และ project ใน org นี้
- งานที่ยัง assign อยู่ → แจ้ง project admin (เหมือนกรณี deactivate)
- ห้าม remove **owner คนสุดท้าย**

> ต่างจาก deactivate — deactivate ใช้กับพนักงานที่ลาออกแต่ยังอยากเก็บชื่อไว้ในรายชื่อ · remove ใช้กับคนนอกที่จบงานแล้ว

#### Delete Account

**บังคับให้ owner จัดการ org ก่อนลบ** — ไม่มี auto เลื่อนใครขึ้นมา เพราะได้คนที่ไม่รู้เรื่องหรือไม่อยากรับผิดชอบจะแย่กว่าไม่มี owner

| สถานการณ์                               | ทำยังไง                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| เป็น owner คนสุดท้ายของ org ที่มีคนอื่น        | บังคับเลือก: ตั้ง owner ใหม่ หรือลบ org ก่อน                        |
| เป็น owner คนสุดท้ายของ org ที่มีตัวเองคนเดียว | ลบ org ไปพร้อมกัน                                             |
| ยังมี owner คนอื่นเหลืออยู่                   | ลบได้เลย                                                     |
| เป็นแค่ admin/member                     | ลบได้เลย                                                     |
| Owner หายไปเฉยๆ ไม่ได้กดลบ               | **ปล่อยไว้** — org ใช้งานได้ปกติ ถ้ามี owner หลายคนตั้งแต่แรกก็ไม่มีปัญหา |

**Flow — grace period 30 วัน กู้คืนได้**

```
กดลบ account
   ↓
ตรวจ org ที่เป็น owner คนสุดท้าย → บังคับจัดการก่อน
   ↓
ยืนยันด้วยการพิมพ์อีเมลตัวเอง
   ↓
status = 'pending_deletion' + deletion_requested_at = now()
   เข้าระบบไม่ได้ · ข้อมูลยังอยู่ครบ (ยังไม่ anonymize)
   ↓
ภายใน 30 วัน:
  ├─ login ด้วยรหัสเดิม → ปลดล็อกกลับมาใช้ต่อได้ทันที (ล้าง deletion_requested_at ด้วย)
  └─ สมัครใหม่ด้วยอีเมลเดิม → "บัญชีนี้อยู่ระหว่างรอลบ ต้องการกู้คืนไหม?" → login แทน
   ↓
ครบ 30 วัน → retention job anonymize จริง (status = 'deleted')
   ↓
งานที่ยัง assign อยู่ → แจ้ง project admin
```

> **สำคัญ: anonymize ต้องเกิดหลังครบ 30 วัน ไม่ใช่ตอนกดลบ** — ถ้า anonymize ทันทีจะกู้คืนไม่ได้ เพราะชื่อ/อีเมลถูกล้างไปแล้ว

**ตอนกดลบต้องบอกให้ชัด:** org ที่โอน owner หรือลบไปแล้ว จะไม่ได้คืนอัตโนมัติถ้ากู้บัญชีกลับมา — ต้องให้ owner ปัจจุบันแต่งตั้งใหม่

**ตอน anonymize ต้องล้าง `chat.identities` ด้วย** — `external_id` ของ Discord/Line เป็นข้อมูลส่วนบุคคลเหมือนกัน

**ทำไมต้อง anonymize ไม่ใช่ hard delete**

- Task, comment, activity log จะกลายเป็นเด็กกำพร้า
- ประวัติที่บริษัทต้องใช้ตรวจสอบจะหาย
- UI แสดงเป็น "ผู้ใช้ที่ถูกลบ" (แบบ GitHub/Slack)

**PDPA:** กฎหมายให้สิทธิ์ลบข้อมูลส่วนบุคคล (ชื่อ อีเมล รูป) แต่ไม่ได้บังคับให้ลบบันทึกการทำงานที่บริษัทมีสิทธิ์เก็บตามความจำเป็นทางธุรกิจ

`identity.users.status` = `'active' | 'deactivated' | 'pending_deletion' | 'deleted'` — [ดู schema เต็ม](./02-database.md#schema-identity)

#### Team

- สร้าง / แก้ไข / ลบทีม
- เพิ่ม-ลบสมาชิก, 1 คนอยู่ได้หลายทีม
- Role ระดับทีม: `admin` / `member` — **มี admin ได้หลายคน**

> ไม่สร้าง role "รอง lead" แยก — ใครที่ต้องกดแทนได้ตั้งเป็น admin ไปเลย เพิ่มชั้นลำดับขั้นเมื่อไหร่ ความซับซ้อนของ permission โตแบบทวีคูณ

#### Assigning to a Whole Team

- `task_assignees (task_id, assignee_type: 'user' | 'team', assignee_id)`
- สมาชิกทุกคนในทีมเห็นงานใน My Tasks
- `completion_policy` ระดับ project: `anyone` (default) / `privileged`
  - `anyone` — ใครก็ได้ในทีมกดเสร็จ แต่บันทึกว่าใครกด
  - `privileged` — เฉพาะ owner / admin (org, team, project) / ผู้สร้าง task
- แสดง "เสร็จโดย [ชื่อ] เมื่อ [เวลา]" บน task เสมอ

> ล็อกไว้ที่ lead คนเดียวจะกลายเป็นคอขวด (ลาพักร้อน = งานทั้งทีมค้าง) สุดท้ายคนเลิกอัปเดตแล้วไปคุยกันใน chat แทน ซึ่งเป็นสิ่งที่ระบบนี้พยายามแก้

#### Sub-task

ใช้แนว **self-referencing** (`parent_task_id`) — sub-task คือ task ตัวเต็มที่มีพ่อ มี status, assignee, due date ครบเหมือนกัน

> เคสหลัก: PM สร้าง main task → assign ให้ทีม → ทีมไปแตก sub-task กันเอง

**ความลึก**

- `tasks.depth` เก็บเป็น denormalized field คำนวณตอน insert (`parent.depth + 1`) ไม่คำนวณตอน query
- `MAX_TASK_DEPTH` เป็น config ไม่ hard-code
- **Phase 2 เปิด 2 ชั้น** (`depth 0-1`) — Phase 5 พิจารณาปลดเป็น 3 ชั้นถ้ามีคนขอจริง
- ปุ่ม "เพิ่ม sub-task" หายไปเมื่อถึง depth สูงสุด ไม่ใช่กดแล้วขึ้น error

**สิทธิ์สร้าง sub-task**

- Owner / Admin (org / team / project)
- คนที่ถูก assign บน parent (ทั้ง `'user'` และสมาชิกในทีมที่ถูก assign)
- ผู้สร้าง parent (`created_by`) — จำเป็นเพราะ PM อาจไม่ได้ assign ตัวเองและไม่ใช่ admin ของทีมนั้น
- สิทธิ์ไล่ตาม parent ไม่ใช่ตัวมันเอง

**การ assign sub-task**

- ไม่บังคับให้อยู่ในทีมที่ถือ parent — ดึงคนนอกมาช่วยได้
- แต่เรียงสมาชิกทีมที่ถือ parent ขึ้นเป็นลำดับแรกใน picker (กรณีปกติ ~90%)

**Inherit จาก parent ตอนสร้าง** (pre-fill แต่แก้ได้ ยกเว้น project)

| Field    | พฤติกรรม                                                 |
| -------- | ------------------------------------------------------- |
| Project  | บังคับ ต้องเป็น project เดียวกับ parent เสมอ                  |
| Due date | inherit เป็นค่าเริ่มต้น (เตือนถ้าตั้งเกิน parent)                 |
| Priority | inherit                                                 |
| Assignee | **ว่างไว้** อย่า inherit ทีมลงมา — sub-task ต้องมีเจ้าของชัดเจน |
| Status   | ใช้ `is_default` ของ project ตามปกติ                      |

**Progress และการปิดงาน**

**Task Progress** — parent แสดงความคืบหน้าจาก sub-task นับตาม `is_done_type` (ไม่ hard-code ชื่อ status)

```
progress = done / (total − cancelled)
```

**งานที่ยกเลิกตัดออกจากตัวหารด้วย** — sub-task 5 อัน เสร็จ 2 ยกเลิก 1 → แสดง `2/4` ไม่ใช่ `2/5`
เพราะ 2/5 ทำให้ดูเหมือนเหลืองานอีก 3 ทั้งที่จริงเหลือ 2

ถ้า `total − cancelled = 0` → ไม่แสดง progress

- **ไม่ auto done** — sub-task เสร็จครบแล้วให้ prompt ที่ parent ว่า _"sub-task เสร็จครบแล้ว ปิดงานหลักเลยไหม?"_ + ส่ง noti ให้ผู้สร้าง/ผู้ถูก assign parent
  - เหตุผล: parent มักมีงานที่ไม่ได้แตกเป็น sub-task (ตรวจงาน รวมผล ส่งลูกค้า), ทีมเพิ่ม sub-task ทีหลังได้ตลอด, และ auto done ทำให้ `completed_by` เป็น system → audit เสีย
  - เผื่อไว้: `auto_complete_parent: boolean` เป็น setting ระดับ project (default `false`)
- ปิด parent ทั้งที่มี sub-task ค้าง → **เตือน แต่ทำได้**
- Sub-task ที่ค้างหลัง parent ปิด/ถูกลบ → ยังโผล่ใน My Tasks ของเจ้าของ ไม่หายเงียบๆ

**การย้าย task**

| การกระทำ                                               | อนุญาต               |
| ------------------------------------------------------ | ------------------- |
| แยก sub-task ออกเป็น task หลัก (`parent_task_id → null`) | ✅                  |
| ย้าย task ไปเป็น sub-task ของ task อื่น                    | ❌                  |
| ย้าย sub-task ไปใต้ parent อื่น                            | ❌                  |
| ย้ายข้าม project                                         | ❌ (พิจารณา Phase 4) |

เหตุผลที่อนุญาตเฉพาะการแยกออก:

- ทิศทางเดียว depth ลดลงเสมอ → ไม่ต้อง cascade, ไม่มี cycle, ไม่มีทางเกิน limit
- เก็บ comment / ไฟล์แนบ / activity log / assignee ไว้ครบ ต่างจากลบแล้วสร้างใหม่
- โค้ดแค่ set null + update depth ตัวเดียว

**เมื่อแยกออกมา `sprint_id` จะเป็น null (ตกไป Backlog)** — เพราะ sub-task ไม่เคยมี sprint ของตัวเอง และการแยกออกแปลว่าเป็นงานคนละก้อนแล้ว ควรให้คนตัดสินใจใหม่ว่าจะเข้ารอบไหน

> ต้องแจ้งตอนกด: _"งานนี้จะถูกย้ายไป Backlog"_ ไม่ให้หายเงียบๆ

บันทึกลง activity log ว่าใครแยกออกมาเมื่อไหร่ · ใครทำได้: คนที่มีสิทธิ์แก้ไข task นั้น

**การแสดงผล**

- หน้า task detail แสดง sub-task ทั้งหมดพร้อม assignee + status
- แสดง `created_by` ของ sub-task จริงบน UI — PM ต้องรู้ว่าใครแตกงานนี้ออกมา
- Indent ตาม `depth` ใน list view
- Breadcrumb ในหน้า detail (`Project > งานหลัก > งานย่อย`)
- ถ้ามี sub-task เลย due date → ขึ้นสัญญาณที่ parent ด้วย

**กติกาทางเทคนิค**

- Query list หลักใช้ `WHERE depth = 0` (เร็วและอ่านง่ายกว่า `parent_task_id IS NULL`)
- **แต่ My Tasks ต้องแสดง sub-task ด้วย** — คนถูก assign sub-task ต้องเห็นงานตัวเอง (จุดที่มักพลาด)

ฟิลด์ที่เกี่ยวข้องใน `task.tasks` — [ดู schema เต็ม](./02-database.md#schema-task)

```
parent_task_id  uuid null
depth           int default 0
completed_by    uuid null
completed_at    timestamptz null
```

#### Sprint (Basics)

**ไม่บังคับใช้** — เป็น setting ระดับ project

```
projects.sprint_enabled  boolean  default false
```

- `false` (default) → ไม่มีเมนู Sprint, ไม่มี dropdown ในหน้า task, ไม่มี sprint board
- `true` → เปิดครบ

> ฝ่ายที่ทำงานตามที่ลูกค้าสั่งเรื่อยๆ ไม่ควรเห็นฟิลด์ที่ไม่เกี่ยวข้อง ทีมที่ทำเป็นรอบค่อยเปิดเอง

**สิ่งที่ทำใน Phase 2**

- CRUD sprint (name, goal, start/end date, status)
- **ปิด sprint แบบง่าย** — งานที่ยังไม่ `is_done_type` ตกไป Backlog อัตโนมัติ (ตัวเลือก carry over อยู่ Phase 3)
- Dropdown เลือก sprint ในหน้า task
- Filter ตาม sprint ใน list view
- **Backlog = `sprint_id IS NULL`** ไม่ต้องสร้าง sprint พิเศษชื่อ Backlog

> ต้องมีวิธีปิด sprint ตั้งแต่ Phase 2 ไม่งั้นติดกติกา "active ได้ 1 อัน" แล้วสร้าง sprint ถัดไปไม่ได้

**กติกา**

- 1 project มี sprint สถานะ `active` ได้แค่ **1 อัน** (บังคับที่ application)
- **Sub-task ไม่มี sprint ของตัวเอง** — ตาม parent เสมอ ห้ามแก้ `sprint_id` ของ task ที่ `depth > 0`
- ปิด `sprint_enabled` ทีหลัง → ข้อมูล sprint เก่ายังอยู่ เปิดกลับมาเห็นเหมือนเดิม
- Filter/dashboard ต้องไม่พังเมื่อ `sprint_id` เป็น null ทั้งหมด

```
project.sprints
  name              -- "Sprint 12"
  goal              -- เป้าหมายของรอบนี้ (nullable)
  start_date        -- date (วันที่ล้วน)
  end_date          -- date
  status            -- 'planned' | 'active' | 'completed'

task.tasks
  sprint_id  uuid null   -- null = Backlog
```

[ดู schema เต็ม](./02-database.md#schema-project)

#### Chat Integration — Discord

**ฟีเจอร์ดาวเด่น** — อย่าลากคนออกจากแชทเข้าเว็บ ให้ระบบไปหาเขาแทน

- Forward/พิมพ์ข้อความในห้อง → กลายเป็น task
- กดปุ่มในแชทเพื่อเปลี่ยนสถานะ/ปิดงาน โดยไม่ต้องเปิดเว็บ
- สรุปงานค้างส่งเข้าห้องทุกเช้า
- แจ้งเตือนเมื่อถูก assign ส่งเข้าแชทแทน/เพิ่มจากอีเมล

> แก้ปัญหาที่ระบบ task ภายในมักตายเพราะคนไม่เข้ามาอัปเดต — และเจ้าใหญ่ทำ Line ไม่ดีเพราะไม่ใช่ตลาดของเขา นี่คือจุดที่ลอกยากกว่าราคา

**เริ่มที่ Discord ก่อน** ไม่ใช่เพราะคนใช้เยอะสุด แต่เพราะทำเสร็จเร็วสุด (webhook ง่าย, button/modal/slash command ดีที่สุด) ได้พิสูจน์ว่าแนวคิดใช้ได้จริงก่อนลงแรงกับ Line ที่ตลาดใหญ่กว่า

**ออกแบบเป็น adapter ตั้งแต่แรก**

```
ChatAdapter (interface)
├─ DiscordAdapter   Phase 2
├─ LineAdapter      Phase 3
└─ TeamsAdapter     Phase 6
```

ทุกเจ้ามีสามอย่างเหมือนกัน — รับข้อความเข้า (webhook), ส่งออก, ปุ่มโต้ตอบ ต่างกันแค่ payload

|         | Webhook       | ส่งออก   | ปุ่ม                           | ความยาก |
| ------- | ------------- | ------- | ---------------------------- | ------- |
| Discord | ง่ายมาก        | ง่าย     | button, modal, slash command | ⭐      |
| Line    | ปานกลาง       | ง่าย     | Flex Message + quick reply   | ⭐⭐    |
| Teams   | ยุ่งกับ Azure AD | ปานกลาง | Adaptive Cards               | ⭐⭐⭐  |

Teams ต้องผ่าน Microsoft app approval ซึ่งใช้เวลาและเอกสารเยอะ → รอมีลูกค้าองค์กรขอ

**Schema (สร้างตอน Phase 2 นี้เอง · ดูเต็มใน [`02-database.md`](./02-database.md#schema-chat-phase-2))**

สองตารางนี้เป็นตารางอิสระ ไม่มีตารางอื่นชี้มาหา จึงเป็นข้อยกเว้นเดียวของกติกา "สร้าง schema ครบทุก module ใน Phase 0" — เพิ่มตอน Phase 2 ไม่เจ็บ

```
chat.identities (
  id, org_id, user_id,
  platform,              -- 'discord' | 'line' | 'teams'
  external_id,           -- user id ฝั่งนั้น
  linked_at
)

chat.channels (
  id, org_id, project_id,
  platform, external_channel_id,
  default_assignee_id    -- nullable
)
```

- ผูกตัวตนครั้งแรกด้วยโค้ดยืนยัน ทำครั้งเดียวจบ
- ผูกห้องกับ project — ข้อความจากห้องไหนเข้า project ไหน
- ใช้ event ที่มีอยู่แล้ว (`task.created`, `task.assigned`, `task.completed`) ไม่ต้องแก้ core

**เคสที่ต้องตัดสินตอนทำจริง**

> ❓ **ยังไม่ตัดสิน** — ตารางนี้เป็นข้อเสนอเบื้องต้น ยังไม่ผูกมัด · ตัดสินตอนลงมือทำ Phase 2

| เคส                           | แนวทาง                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| คนพิมพ์แต่ยังไม่ link identity     | บอตตอบในห้องพร้อมลิงก์ผูกบัญชี — ผูกครั้งเดียวจบ                                        |
| ห้องยังไม่ผูก project             | บอตถามว่าจะผูกกับ project ไหน (เฉพาะคนที่มีสิทธิ์)                                    |
| link แล้วแต่ไม่ใช่ project member | สร้างได้ แล้วถาม project admin ว่าจะเพิ่มเข้า project ไหม                           |
| Server เดียวผูกหลาย org         | **ห้าม** — 1 `external_channel_id` ผูกได้ org เดียว (unique index) กันข้อมูลข้ามบริษัท |

#### Project Settings Accumulated by Phase 2

```
project.projects
  completion_policy      -- 'anyone' (default) | 'privileged'
  auto_complete_parent   -- boolean, default false
  sprint_enabled         -- boolean, default false
  estimate_unit          -- 'none' (default) | 'point' | 'hour' | 'tshirt' — UI เปิด Phase 4
```

ยังเป็น column ธรรมดาได้ ถ้าเกิน 8-10 ตัวค่อยพิจารณาย้ายเป็น `settings jsonb` ก้อนเดียว

#### Other Phase 2 Items

- Assignee picker เพิ่มลำดับ "สมาชิกทีมที่ถือ parent"
- **My Tasks แยก section + filter** — คนที่อยู่ 5 ทีมจะเห็นงานที่ไม่ใช่ของตัวเองเป็นร้อย ถ้าไม่แยก

  ```
  ▸ งานของฉันโดยตรง (12)     ← กางเสมอ
  ▸ งานทีม Marketing (8)      ← พับไว้ จำสถานะที่ผู้ใช้เลือก
  ▸ งานทีม Sales (15)
  ▸ งานทีม Dev (30)
  ```

  - Toggle "ซ่อนงานทีม" สำหรับคนที่อยากดูแค่ของตัวเอง
  - Filter ทีมได้ในหน้าเดียวกัน
  - รวม sub-task ที่ assign ให้ตัวเองด้วย

- Permission layer ใช้งานเต็ม (org / team / project role)

---

### Phase 3 — Collaboration `v1.2.0`

- **Kanban board** — drag & drop (LexoRank ได้ใช้จริง), จัดกลุ่มตาม status

  **Sub-task แสดงเป็นการ์ดแยก** พร้อมตัวบอกว่าเป็นลูกของใคร

  ```
  ┌─────────────────────┐
  │ ↳ ออกแบบ mockup      │
  │   จาก: ทำหน้า login   │
  │   👤 สมชาย            │
  └─────────────────────┘
  ```

  เหตุผล: Kanban คือเครื่องมือติดตาม flow ของงาน ถ้าซ่อน sub-task คนที่ถูก assign จะไม่เห็นงานตัวเองบน board
  (ต่างจาก List view ที่ใช้ `WHERE depth = 0` เพราะแสดงแบบ indent อยู่แล้ว)

  มี toggle "ซ่อนงานย่อย" สำหรับ PM ที่อยากดูภาพรวมระดับบน

- **Sprint board** — Kanban ที่ filter ด้วย sprint (ไม่ต้องเขียน view ใหม่) · แสดง sub-task เหมือน Kanban ปกติ และใช้ toggle "ซ่อนงานย่อย" ตัวเดียวกัน
- **ปิด sprint + carry over** — ตอนปิด sprint ระบบถามว่างานที่ยังไม่ `is_done_type` จะเอาไปไหน:
  - ย้ายไป sprint ถัดไป (default)
  - เอากลับ backlog (`sprint_id = null`)
  - ปิดทิ้ง → เปลี่ยนเป็น status ที่เป็น `is_cancelled_type` (ไม่ใช่ `is_done_type`) เพราะไม่ได้ทำจริง — มีผลกับ velocity ใน Phase 4

  ห้ามย้ายอัตโนมัติเงียบๆ · บันทึกลง activity log ว่า task carry over มากี่รอบแล้ว — ข้อมูลนี้มีค่ามากตอนรีวิว

- **Table view**
- **Comment + thread** (`parent_comment_id`) — โครงแบบ Slack
- **ไฟล์แนบ** — object storage (Garage) + presigned URL
- **Activity log UI** — ข้อมูลเก็บมาตั้งแต่ Phase 0 แล้ว
- แจ้งเตือนครบชุด — ใกล้ deadline, mention, comment ใหม่, status เปลี่ยน
- Tag / Label
- **Chat Integration — Line** (adapter ที่สองบนโครงเดียวกับ Discord)

#### Stale Detection

ตรวจเองว่างานไหนค้างผิดปกติ แล้วเตือนคนที่ควรรู้

> "3 งานนี้ไม่มีความเคลื่อนไหว 8 วัน — งานปกติของทีมคุณใช้เวลาเฉลี่ย 3 วัน"

- ต่างจากเตือน deadline ทั่วไปตรงที่**จับปัญหาก่อนถึง deadline**
- เทียบกับพฤติกรรมจริงของทีมนั้น ไม่ใช่กฎตายตัว
- ใช้ activity log ที่เก็บมาตั้งแต่ Phase 0 — **ไม่ต้องใช้ AI เลย**
- ส่งเข้าแชทได้ผ่าน adapter ที่ทำไว้แล้ว

---

### Phase 4 — Custom Fields, Views, Reports, Estimates `v1.3.0`

#### Custom Field (Project Level)

**วิธีเก็บค่า: jsonb column**

```
tasks.custom_fields  jsonb   -- {"<field_uuid>": "2026-08-20", ...}
```

เหตุผลที่เลือก jsonb แทน EAV (`field_values` แยกตาราง):

- Read หนักกว่า write มาก — คนเปิด list view ทั้งวัน แต่แก้ custom field นานๆ ครั้ง jsonb อ่านมาพร้อม task ไม่ต้อง join
- สเกลไม่ใหญ่ — คน 100 คน ปีละไม่กี่หมื่น task ปัญหา performance ของ jsonb เริ่มเห็นตอนหลักล้านแถวขึ้นไป
- โค้ดง่ายกว่ามาก ซึ่งสำคัญเพราะคนดูแลระบบคือพวกเราเอง

ข้อควรระวัง:

- Key ใน jsonb ใช้ **field UUID ไม่ใช่ชื่อ** — เปลี่ยนชื่อฟิลด์ทีหลังจะได้ไม่พัง
- GIN index: `CREATE INDEX ON task.tasks USING gin (custom_fields)`
- ฟิลด์ที่ filter บ่อยเพิ่ม expression index เฉพาะตัว
- ลบ field definition → soft delete ก่อน แล้วมี job ล้างค่าค้างใน jsonb
- Validate ด้วย zod ที่ generate แบบ dynamic จาก `field_definitions` ใช้ทั้งสองฝั่ง
- ถ้าอนาคตต้องทำ report รวมยอด/pivot ข้าม project → ทำ read model แยก (materialized view) ไม่ต้องเปลี่ยนวิธีเก็บหลัก

**Type ที่รองรับก่อน:** Text, Date, Number, Select
**เติมทีหลัง:** Multi-select, Person, Checkbox, URL

#### Built-in vs Custom Field

ไม่ทำแบบ Notion ที่เกือบทุก property เป็น custom — เพราะระบบต้อง**รู้ความหมาย**ของฟิลด์ ไม่ใช่แค่เก็บค่า

| Built-in (ระบบเข้าใจความหมาย)                               | Custom field                        |
| ---------------------------------------------------------- | ----------------------------------- |
| Title, Status, Assignee, Due date, Priority, Created by/at | "วันที่ตรวจ", "เลขที่เอกสาร", "ลูกค้า" ฯลฯ |

ถ้าทำ status เป็น custom field จะเสีย `is_done_type`, `completion_policy`, `completed_by`, progress ของ sub-task, logic แจ้งเตือนเลย due date และ Kanban ที่รู้ว่าจัดกลุ่มตามอะไร

**แต่หยิบสิ่งที่ Notion ทำดีมาใช้:** built-in กับ custom ต้องดูและใช้งานเหมือนกันหมด — สลับตำแหน่ง ซ่อน filter sort group by ได้เท่ากัน ต่างกันแค่ built-in ลบไม่ได้และเปลี่ยน type ไม่ได้

#### View Config

แยกสามเรื่องออกจากกัน:

| เรื่อง                    | เก็บที่ไหน                            |
| ----------------------- | ---------------------------------- |
| **ค่า** ของ custom field | `tasks.custom_fields` (jsonb)      |
| **นิยาม** ฟิลด์            | `field_definitions` (ระดับ project) |
| **ลำดับและการแสดงคอลัมน์** | `views` + `view_columns`           |

```
field.definitions (
  id, org_id, project_id,
  name, type, config_json, sort_order,
  created_at / updated_at / deleted_at
)

view.views (
  id, org_id, project_id,
  name,              -- "งานของฝ่ายตรวจ"
  type,              -- 'table' | 'board' | 'calendar'
  owner_id,          -- null = view กลางของ project / มีค่า = view ส่วนตัว
  filter_json, sort_json, group_by
)

view.columns (
  id, org_id, view_id,
  column_type,       -- 'builtin' | 'custom_field'
  column_key,        -- 'status' | 'assignee' | <field UUID>
  sort_order,        -- LexoRank
  width,             -- px, nullable
  is_visible
)
```

`column_type` + `column_key` ทำให้ built-in กับ custom field อยู่ในลิสต์เดียวกัน — ผู้ใช้ลาก custom field ไปวางหน้า status ได้

`owner_id` แยก "view กลางของ project" กับ "view ส่วนตัวของฉัน"

#### Reports

- Calendar view
- Dashboard สรุป — งานค้าง, เกินกำหนด, % เสร็จ (นับจาก `is_done_type`)
- Group by / Sort ยืดหยุ่น
- Export Excel / PDF

#### Handover Mode

พนักงานลาออก / ลาคลอด / ย้ายแผนก → กดปุ่มเดียวเห็นงานทั้งหมดของคนนั้น

- โอนเป็นชุดให้คนอื่นได้ทีเดียว (เลือกทั้งหมด หรือเลือกทีละงาน)
- สรุปสถานะแต่ละงานให้คนรับ
- บันทึกลง activity log ว่าใครโอนให้ใครเมื่อไหร่
- รองรับทั้ง assign เดี่ยวและงานที่อยู่ในทีม

> ปัญหานี้ทุกบริษัทเจอ แต่เกือบทุกเครื่องมือไม่มีให้ — ต้องไล่ filter เองทีละงาน

ต้องรอ Phase 4 เพราะต้องมี team + permission ครบก่อน

#### Estimate + Velocity

**ไม่บังคับใช้** — setting ระดับ project เหมือน sprint

```
tasks.estimate           numeric null
projects.estimate_unit   -- 'none' (default) | 'point' | 'hour' | 'tshirt'
```

- `none` → ซ่อนช่องกรอกไปเลย burndown ใช้**จำนวน task** แทน
- `point` / `hour` → กรอกตัวเลข
- `tshirt` → เลือก S/M/L/XL แล้ว map เป็นตัวเลขเบื้องหลัง (1/2/3/5)

**ตั้งใจไม่ผูกกับคำว่า "point"** — บางทีมประมาณเป็นชั่วโมง บางทีมใช้ T-shirt size ฟิลด์กลางชื่อ `estimate` รองรับได้หมด

**Dashboard: ระดับทีม/sprint เท่านั้น — ไม่ทำ leaderboard รายคน**

- Burndown chart (รองรับทั้งจำนวน task และผลรวม estimate)
- Velocity ของ sprint (รวมทั้งทีม)

> เหตุผลไม่ใช่แค่เรื่องอุดมคติ — leaderboard รายคนทำให้คนประมาณเผื่อ แตก task ย่อยๆ ให้นับได้เยอะ หรือเลี่ยงงานที่ estimate น้อยแต่ใช้เวลานาน พอข้อมูลเพี้ยน **capacity planning ซึ่งเป็นเป้าหมายหลักจะพังตามไปด้วย** เพราะใช้ข้อมูลชุดเดียวกัน

**บริษัทที่ต้องใช้ KPI** → export ออก Excel แล้วไปทำเอง ระบบไม่ตอกย้ำพฤติกรรมนั้นในตัว product · ถ้าลูกค้า SaaS ขอจริงจังค่อยทำเป็น report เสริมใน Phase 7

---

### Phase 5 — Advanced Features + Semantic Search `v2.0.0`

- Nested page — พิจารณาปลด `MAX_TASK_DEPTH` เป็น 3 ชั้น
- Template สำเร็จรูป (Sprint, Bug tracker, Meeting notes)
- Rich text editor แบบ `/` command
- Timeline / Gantt view
- Recurring task
- Time tracking
- `completion_policy: all_assignees`

#### Semantic Search + Duplicate Detection

ใช้ **embedding อย่างเดียว ไม่ต้องมี LLM** — ต้นทุนเกือบเป็นศูนย์ จึงทำได้ก่อนถึง SaaS

- **Semantic search** — ค้น "งานเกี่ยวกับระบบจ่ายเงิน" แล้วเจอแม้ไม่มีคำนั้นตรงๆ
- **ตรวจงานซ้ำ** — ตอนสร้าง task เตือนว่า "มีงานคล้ายกันอยู่แล้ว" (ใช้ vector เดียวกัน)

**เทคนิค**

- Embedding model ตัวเล็กที่รองรับไทย (เช่น multilingual-e5-small, BGE-M3) — **รันบน CPU ได้ ไม่ต้องมี GPU**
- เก็บ vector ลง **pgvector** บน Postgres ที่มีอยู่แล้ว
- ตารางแยก ไม่ต้อง migrate `tasks`

```
task.task_embeddings (
  task_id, org_id,
  embedding  vector,
  updated_at
)
```

- Embed ตอนสร้าง/แก้ title + description (ผ่าน event เหมือน activity log ไม่บล็อก request)
- ตรวจงานซ้ำ: cosine similarity ในขอบเขต project เดียวกัน + เตือนเฉยๆ ไม่บล็อกการสร้าง
- ต้อง scope ด้วย `org_id` เหมือนทุกตาราง

> AI feature ที่ต้องใช้ LLM (Chat → Task, สรุป comment thread, สรุป sprint) เลื่อนไป Phase 7 เพราะมีค่าใช้จ่ายต่อการเรียกจริง ควรรอให้มี billing รองรับก่อน

---

### Phase 6 — Polish `v2.1.0`

- Light mode (แอปเป็นดาร์กธีมเดียว — ดูข้อควรระวังใน [`03-roadmap.md`](./03-roadmap.md))
- Mobile responsive / PWA
- Global search
- Real-time collaboration
- **Chat Integration — Microsoft Teams** (ต้องผ่าน app approval ใช้เวลานาน)
- Integration อื่น — Google Calendar, Slack, webhook ทั่วไป
- Performance tuning
