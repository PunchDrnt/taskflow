# Phase 2 — Team + Sub-task + Sprint `v1.1.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

Phase 1 ทำให้คนหนึ่งคนทำงานได้ · Phase 2 ทำให้**หลายคนแตะงานเดียวกันได้** — ทีม, assign ให้ทีม,
sub-task, และกติกาว่าใครกดปิดงานได้ · พร้อมกับปิดชั้นความปลอดภัยชั้นที่สองที่ค้างมาจาก Phase 0

**Chat integration (Discord / Line) ไม่อยู่ใน phase นี้แล้ว** — ย้ายไป [Phase 4 ช่วงหลัง](./phase-4.md)
พร้อมเหตุผล · schema `chat` ยังว่างอยู่จนถึงตอนนั้น

---

## RLS — ชั้นกันข้าม org ที่สอง

🔴 **ห้ามเลื่อน** และเป็นข้อเดียวใน phase นี้ที่พลาดแล้วเสียหายเป็นข้อมูลลูกค้า ไม่ใช่เสียเวลา

เหตุผลที่เลื่อนไม่ได้อีกแล้ว: [หนึ่งคนอยู่ได้หลาย org ตั้งแต่ Phase 1](./phase-1.md#หนึ่งคนอยู่ได้หลาย-org-ตั้งแต่-phase-1)
แปลว่าข้อมูลของนายจ้างกับงานส่วนตัวอยู่ในฐานเดียวกัน คนละเจ้าของ · ตั้งแต่ Phase 0 ถึงตอนนี้
`org_id` scoping ที่ชั้น application เป็น**ชั้นเดียว** — bug ตัวเดียวใน service ที่เผลอเรียก
`queryBuilder.base()` แทน `withOrg()` คือข้อมูลข้าม org ทันที โดยไม่มีอะไรค้านที่ฐานข้อมูล

**สิ่งที่ต้องทำ** — [รายละเอียดเต็ม + ทางเลือกทั้งสาม](../01-architecture.md#org_id-scoping)

- เปิด RLS ทุกตารางที่มี `org_id` · **ต้องมี `FORCE ROW LEVEL SECURITY` ด้วย** ไม่งั้น
  role เจ้าของตาราง (ซึ่งคือ role ที่แอปต่ออยู่) ข้าม policy ได้เงียบๆ
- ตารางที่ **ไม่มี** `org_id` ไม่ต้องมี policy — `iam.*`, `billing.plans`,
  `organization.organizations` · เขียนไว้ให้ชัดว่าตั้งใจไม่ทำ ไม่ใช่ลืม
- ปิด ❓ ที่ [`01-architecture.md`](../01-architecture.md#transaction) ค้างไว้: `set_config(..., true)`
  เป็น transaction-local แต่ read ของเราไม่เปิด transaction → ค่าหายก่อน query จะรัน
  **ต้องเลือกทางใดทางหนึ่งก่อนเปิด RLS** ไม่งั้น policy จะกรองทุกแถวออกหมดแล้วหน้าจอว่าง

**เทสต์ที่ต้องเพิ่ม** — 🔒 [`org-isolation.spec.ts`](../../checklists/definition-of-done.md) ต้องผ่านเหมือนเดิม
แล้วเพิ่มอีกข้อ: **query ที่ไม่ได้ set org ไว้ต้องได้ 0 แถว ไม่ใช่ได้ทุกแถว** — นี่คือข้อที่แยก
"RLS ทำงาน" ออกจาก "RLS เปิดอยู่แต่ policy อนุญาตทุกอย่าง"

## Team

- สร้าง / แก้ไข / ลบทีม · **คนที่สร้างทีมถูกใส่เข้าทีมนั้นเอง**
- เพิ่ม-ลบสมาชิก, 1 คนอยู่ได้หลายทีม
- Role ระดับทีม: `admin` / `member` — **มี admin ได้หลายคน**
- **ลบทีม → งานที่ assign ให้ทีมนั้นกลายเป็นไม่มีผู้รับ ไม่มีใครหลุดออกจาก org**
  · เป็นการลบแถว `task.assignees` ที่ชี้มาที่ทีม ไม่ได้แตะ assignee ที่เป็นคน
  · ต้องบอกจำนวนงานก่อนกดยืนยัน ไม่ใช่ลบแล้วค่อยรู้

> ไม่สร้าง role "รอง lead" แยก — ใครที่ต้องกดแทนได้ตั้งเป็น admin ไปเลย เพิ่มชั้นลำดับขั้นเมื่อไหร่ ความซับซ้อนของ permission โตแบบทวีคูณ

**เอาคนออกจากทีม = เปลี่ยนคนที่ถูก assign โดยไม่มีแถวไหนขยับ**

งานที่ assign ให้ทีมเก็บแค่ `assignee_id` ของ**ทีม** ไม่ได้กาง member ออกเป็นแถว
ถอดคนออกจากทีมจึงทำให้เขาหลุดจากทุกงานที่ทีมนั้นถืออยู่ทันที โดย `task.assignees` ไม่มีอะไรเปลี่ยน
และ activity log ของงานเหล่านั้นก็ไม่มีอะไรขึ้น

- **เตือนก่อนกด** — _"คนนี้จะหลุดจากงานที่ทีมถืออยู่ 12 งาน"_ ทรงเดียวกับที่แจ้งตอนแยก sub-task
  ออกมาแล้วจะตกไป Backlog · บอกก่อน ดีกว่าให้ไปเจอเองว่างานหายจาก My Tasks
- **log ลงที่ team ไม่ใช่ไล่เขียนลงทุก task** — event นี้เป็นการเปลี่ยนแปลงของทีม
  การเขียน 12 แถวลง `audit.logs` เพื่อบันทึกสิ่งที่ไม่ได้เกิดกับ task นั้นๆ จะทำให้ log
  ของงานเต็มไปด้วยเรื่องที่ไม่ได้เกิดกับตัวมัน

## Assigning to a Whole Team

- `task.assignees (task_id, assignee_type: 'user' | 'team', assignee_id)`
- สมาชิกทุกคนในทีมเห็นงานใน My Tasks
- `completion_policy` ระดับ project: `anyone` (default) / `privileged`
  - `anyone` — ใครก็ได้ในทีมกดเสร็จ แต่บันทึกว่าใครกด
  - `privileged` — เฉพาะ owner / admin (org, team, project) / ผู้สร้าง task
- แสดง "เสร็จโดย [ชื่อ] เมื่อ [เวลา]" บน task เสมอ

> ล็อกไว้ที่ lead คนเดียวจะกลายเป็นคอขวด (ลาพักร้อน = งานทั้งทีมค้าง) สุดท้ายคนเลิกอัปเดตแล้วไปคุยกันใน chat แทน ซึ่งเป็นสิ่งที่ระบบนี้พยายามแก้

**หนึ่งงานมีได้หลายทีม และปนคนกับทีมได้**

`assignees` เป็นตารางลูก มี `UNIQUE (task_id, assignee_type, assignee_id)` เท่านั้น —
ไม่มีอะไรจำกัดจำนวนแถวหรือบังคับให้ทุกแถวเป็นชนิดเดียวกัน · งานหนึ่งจึงมี "ทีม Dev + ทีม Design + สมชาย"
พร้อมกันได้ตั้งแต่ schema ของ Phase 0 · UI ของ Phase 2 เปิดใช้ความสามารถนี้ ไม่ได้เพิ่มอะไรที่ฐานข้อมูล

- นับซ้ำไม่ได้ — คนที่อยู่ทั้งทีม Dev และถูก assign ตรงๆ เห็นงานนี้ครั้งเดียวใน My Tasks
- `completion_policy: privileged` ยอมรับ admin ของ**ทีมใดก็ได้**ที่ถือ task นี้อยู่

## Sub-task

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

**`number` ไม่เปลี่ยนตอนแยกออก** — task key เป็นของถาวรต่อ project ([ดู Task Key](./phase-1.md#task-key))
งานที่เคยเป็น `DEV-87` ยังเป็น `DEV-87` ต่อไป ไม่ว่าจะอยู่ใต้ใคร

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

ฟิลด์ที่เกี่ยวข้องใน `task.tasks` — [ดู schema เต็ม](../02-database/schema.md#schema-task)

```
parent_task_id  uuid null
depth           int default 0
completed_by    uuid null
completed_at    timestamptz null
```

## Sprint (Basics)

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

- 1 project มี sprint สถานะ `active` ได้แค่ **1 อัน** — บังคับที่ database ด้วย partial
  unique index `(project_id) WHERE status = 'active' AND deleted_at IS NULL` ไม่ใช่แค่ที่แอป
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

[ดู schema เต็ม](../02-database/schema.md#schema-project)

## Invitation — API + หน้าจอ

ตาราง `organization.invitations` มีมาตั้งแต่ Phase 1 แต่ยังไม่มีอะไรเขียนลงไปนอกจาก seed
· Phase 2 คือตอนที่มันได้ใช้จริง [ดู schema เต็ม](../02-database/schema.md#schema-organization)

```
เชิญด้วยอีเมล + role ('admin' | 'member' — เชิญเป็น owner ไม่ได้)
   ↓
เก็บ token_hash (ไม่เก็บ plain ทรงเดียวกับ password_reset_tokens) + expires_at
   ↓
ส่งอีเมลพร้อมลิงก์
   ↓
กด accept ─┬─ มี account แล้ว → login แล้วเข้า org ได้เลย
           └─ ยังไม่มี → สมัครตรงนั้น แล้วเข้า org ต่อทันที
   ↓
accepted_at + accepted_by
```

**กติกา**

- **ลิงก์ผูกกับอีเมลที่ถูกเชิญ ไม่ใช่ผูกกับคนที่กด** — คนที่ login อยู่ต้องมีอีเมลตรงกับใบเชิญ
  ถ้าไม่ตรงให้ปฏิเสธพร้อมบอกว่าใบนี้เชิญใคร · อีเมลถูก forward ต่อได้เสมอ
  ถ้าไม่เช็คตรงนี้ คนนอกที่ได้ลิงก์ต่อมาก็เข้า org ของบริษัทได้
- **หมดอายุ 14 วัน · เก็บเป็น env var ไม่ hardcode** (ทรงเดียวกับ [ลิงก์รีเซ็ตรหัสผ่าน](./phase-1.md#auth--users))
  ยาวกว่ารีเซ็ตรหัสผ่านมากเพราะคนละความเสี่ยง — ใบเชิญไม่ได้ให้สิทธิ์เข้าบัญชีที่มีอยู่แล้ว
  และความเสี่ยงจริงถูกกันด้วย "ใช้ได้ครั้งเดียว" + "ต้อง login ด้วยอีเมลนั้น" ไม่ใช่ด้วยความสั้นของหน้าต่างเวลา
  · 14 วันเผื่อคนลาพักร้อนหนึ่งสัปดาห์แล้วยังกดรับทัน
- **ใช้ได้ครั้งเดียว** — `accepted_at` ไม่ null แล้วคือจบ
- **ยกเลิก = `revoked_at` ไม่ใช่ลบแถว** เพราะต้องตอบได้ว่าใครเชิญ ใครยกเลิก เมื่อไหร่
- **คนเดียวมีใบค้างได้ใบเดียวต่อ org** — บังคับด้วย partial unique index
  `(org_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL` · เชิญซ้ำหลังหมดอายุหรือถูกยกเลิกได้
- เชิญคนที่เป็นสมาชิกอยู่แล้ว → บอกไปตรงๆ ว่าเขาอยู่ใน org นี้แล้ว ไม่ต้องสร้างใบเชิญ

**หน้าจอ** — แท็บ Invitations ใน org settings: รายการใบที่ค้าง, ปุ่มส่งซ้ำ, ปุ่มยกเลิก
· owner/admin เท่านั้น

## Remove From Org

- Owner/admin เอาคนออกจาก org ได้
- Account ของเขายังอยู่ ใช้กับ org อื่นได้ปกติ
- ชื่อยังแสดงในประวัติงานเก่าของ org นี้
- ถูกถอดออกจากทุก team และ project ใน org นี้
- งานที่ยัง assign อยู่ → แจ้ง project admin (เหมือนกรณี deactivate)
- ห้าม remove **owner คนสุดท้าย**

> ต่างจาก deactivate — deactivate ใช้กับพนักงานที่ลาออกแต่ยังอยากเก็บชื่อไว้ในรายชื่อ · remove ใช้กับคนนอกที่จบงานแล้ว

## Archive Project + Danger Zone

### Archive project

`project.projects.archived_at` — เก็บ project ที่จบแล้วออกจากสายตา **ไม่ใช่การลบ**

| | archive | soft delete |
| --- | --- | --- |
| ข้อมูลข้างใน | อ่านได้ครบ | ถือว่าไม่มีแล้ว |
| กลับมาได้ | กดปุ่มเดียว | ต้องกู้ทั้งต้นไม้ |
| ใช้ตอน | งานจบแล้วแต่ยังอยากค้นเจอ | สร้างผิด |

**ผลเมื่อ archive**

- หายจาก sidebar และจาก project picker ทุกที่
- **งานข้างในไม่โผล่ใน My Tasks** — นี่คือจุดประสงค์หลัก โปรเจกต์ที่จบแล้วไม่ควรกินพื้นที่หน้าจอใคร
- สร้างงานใหม่ไม่ได้ · ของเดิมยังเปิดอ่านได้ถ้ารู้ URL
- un-archive แล้วทุกอย่างกลับมาเหมือนเดิม ไม่มีอะไรถูกแตะระหว่างนั้น

> **การเห็นงานใน project ที่ archive อีกครั้งต้องรอ [filter ของ My Tasks ใน Phase 3](./phase-3.md)** —
> จนกว่าจะถึงตอนนั้น archive แล้วคืองานหายจาก My Tasks จริงๆ ต้องรู้ก่อนกด

ใครทำได้: project admin หรือ org owner/admin

### ถอดคนออกจาก project

**งานที่เขาถูก assign อยู่ยังอยู่กับเขา เขาแค่เข้า project ไม่ได้แล้ว** — ไม่ใช่การ unassign

แต่นั่นแปลว่ามีคนถูก assign งานที่ตัวเองเปิดไม่ได้ ซึ่งขัดกับกติกาของ Phase 1 ที่ว่า
[assign คนนอก project แล้วระบบเพิ่มเข้า project ให้](./phase-1.md#สิทธิ์ระดับ-project-กั้นจริงตั้งแต่-phase-1)
· **ต้องเตือนก่อนกด** พร้อมจำนวนงาน แล้วให้คนกดตัดสินใจ — ทรงเดียวกับตอนลบทีม
ไม่ใช่ถอดออกเงียบๆ แล้วปล่อยให้เจอเองว่างานเปิดไม่ได้

### Danger zone

รวมของที่กดแล้วย้อนยาก ไว้ท้ายหน้า settings แยกกรอบ · ทุกอันต้องพิมพ์ชื่อยืนยัน

| อยู่หน้า | มีอะไร | ใครกดได้ |
| --- | --- | --- |
| Project settings | archive · ลบ project | project admin / org owner-admin |
| Org settings | โอน owner · **ออกจาก org เอง** · ลบ org | โอน/ลบ = owner เท่านั้น · ออกเอง = ทุกคน |
| Profile | [ลบบัญชีตัวเอง](#delete-account) | เจ้าของบัญชี |

- **ลบ project** เป็น soft delete พาลูกทั้งต้นไม้ไปด้วย — task, sub-task, comment, ไฟล์แนบ
  (ดู `AGGREGATE_CHILDREN` ใน `shared/entity/cascade-soft-delete.ts`) · ถามให้ชัดว่า
  archive ใช่สิ่งที่ต้องการหรือเปล่า ก่อนจะให้ลบ
- **โอน owner** ต้องเลือกคนที่เป็นสมาชิก org อยู่แล้ว · คนเดิมกลายเป็น admin ไม่ใช่หลุดออกจาก org
- **ออกจาก org เอง** คือ [Remove From Org](#remove-from-org) ที่ตัวเองเป็นคนกด — ผลลัพธ์เหมือนกันทุกอย่าง
  จึงใช้โค้ดเส้นเดียวกัน ต่างแค่ว่าใครกด
  · **owner คนสุดท้ายออกเองไม่ได้** ต้องโอน owner ก่อน — กติกาเดียวกับที่ห้าม remove owner คนสุดท้าย
  · งานที่ยัง assign อยู่ **คาไว้เหมือนเดิม** จนกว่าจะมีคนย้าย · บอกให้ชัดตอนกด
    ไม่ใช่เงียบแล้วให้ project admin ไปเจอเองว่ามีงานของคนที่ไม่อยู่แล้ว
- **ลบ org** = soft delete ทั้งก้อน สมาชิกทุกคนหลุดจาก org นี้แต่ account ยังอยู่

## Delete Account

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

**เมื่อถึง Phase 4 ที่มี chat integration: anonymize ต้องล้าง `chat.identities` ด้วย** —
`external_id` ของ Discord/Line เป็นข้อมูลส่วนบุคคลเหมือนกัน · ตารางนั้นยังไม่มีใน Phase 2
จึงยังไม่ต้องทำ แต่เป็นข้อที่ต้องกลับมาแก้ retention job ตอนสร้างตาราง ไม่ใช่ตอนนึกออก

**ทำไมต้อง anonymize ไม่ใช่ hard delete**

- Task, comment, activity log จะกลายเป็นเด็กกำพร้า
- ประวัติที่บริษัทต้องใช้ตรวจสอบจะหาย
- UI แสดงเป็น "ผู้ใช้ที่ถูกลบ" (แบบ GitHub/Slack)

**PDPA:** กฎหมายให้สิทธิ์ลบข้อมูลส่วนบุคคล (ชื่อ อีเมล รูป) แต่ไม่ได้บังคับให้ลบบันทึกการทำงานที่บริษัทมีสิทธิ์เก็บตามความจำเป็นทางธุรกิจ

`iam.users.status` = `'active' | 'deactivated' | 'pending_deletion' | 'deleted'` — [ดู schema เต็ม](../02-database/schema.md#schema-iam)

## Activity Log บนหน้า Task

เลื่อนขึ้นมาจาก Phase 3 เพราะ Team + assign ให้ทีม + `completion_policy: anyone` รวมกันทำให้หลายคนแตะงานเดียวกันได้เป็นครั้งแรก · คำถาม "ทำไม due date เปลี่ยน" กับ "ใครย้ายไป Done" มาถึงใน phase นี้

**ต้นทุนต่ำเพราะข้อมูลครบตั้งแต่ Phase 0** — `audit.logs.changes_json` เก็บ `{ field: { from, to } }` อยู่แล้ว และมี index `(org_id, entity_type, entity_id, occurred_at DESC)` รองรับ query นี้พอดี **ไม่ต้องแตะ schema**

```
📝 สมชาย เปลี่ยนสถานะ To do → In progress    2 ชม.ที่แล้ว
📅 สมหญิง เปลี่ยน due date 20 ส.ค. → 25 ส.ค.  เมื่อวาน
👤 PM มอบหมายให้ ทีม Dev                      3 วันที่แล้ว
```

Phase 2 ทำแค่รายการในหน้า task · feed ระดับ project กับ filter อยู่ Phase 3

**ใครเห็นอะไร — แบ่งตาม _หน่วยของคำถาม_ ไม่ใช่ระดับสิทธิ์**

| คำถาม | ใครเห็น |
| --- | --- |
| "งานนี้เกิดอะไรขึ้นบ้าง" | ทุกคนที่เห็น task นั้น |
| "project นี้เกิดอะไรบ้าง" _(Phase 3)_ | project member · แต่ event ระดับบริหาร (เพิ่ม/ถอดคน, แก้ settings) เฉพาะ admin/owner |
| "คนนี้ทำอะไรบ้าง" | **ไม่ทำ** |

ช่องสุดท้ายคือทรงเดียวกับ [leaderboard รายคน](./phase-4.md#estimate--velocity) ที่ตัดสินไปแล้วว่าไม่ทำ · และเหตุผลที่ให้ไว้ตรงนั้น — พอวัดรายคนแล้วคนจะประมาณเผื่อจนข้อมูลเพี้ยน — **มาจากการรวมยอดรายคน ไม่ได้มาจากการเห็น event ทีละอัน** log ระดับ task จึงไม่ติดข้อนั้น เพราะเป็นข้อมูลชุดเดียวกับที่คนคนนั้นจะได้ถ้านั่งเฝ้า task อยู่แล้ว

**Log อยู่กับ entity ของตัวเอง — ยกเว้นการเกิดและการตายของลูก**

หน้า sub-task แสดง log ของ sub-task · หน้า parent ไม่ยกของลูกมารวม **ยกเว้น** "ลูกถูกสร้าง" กับ "ลูกถูกลบ" ซึ่งเป็นการเปลี่ยนแปลง _ของ parent_ จริงๆ ไม่ใช่ข้อยกเว้นแต่เป็นการระบุเจ้าของ event ให้ถูก

ถ้าไม่ทำแบบนี้ **การลบจะเป็น event เดียวที่ไม่มีหน้าให้แสดง** — หน้าของ sub-task ที่ถูกลบหายไปจาก UI แล้ว คำถาม "งานย่อยหายไปไหน" จึงตอบไม่ได้ ทั้งที่เป็นคำถามที่ activity log มีไว้ตอบพอดี

> 🔒 **ลบ task ไม่ลบ log** — `audit.logs` ไม่เคยถูกลบ ([retention](../01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime)) และ sub-task ที่ "ลบ" คือ soft delete แถวยังอยู่ หาด้วย `withDeleted` ได้
>
> ลบ log ตอนลบ task คือการทิ้งบันทึกว่า _ใครลบ_ ไปพร้อมกัน ซึ่งเป็นแถวที่มีค่าที่สุดในเหตุการณ์นั้น · PDPA แยกกันคนละเรื่อง — ลบข้อมูลส่วนบุคคลผ่าน anonymize ที่ `iam.users` ไม่ได้บังคับให้ลบบันทึกการทำงาน ([ดู Delete Account](#delete-account))

## Project Settings Accumulated by Phase 2

```
project.projects
  archived_at            -- timestamptz null — ไม่ใช่ setting แต่เป็นสถานะที่กดจากหน้า settings
  completion_policy      -- 'anyone' (default) | 'privileged'
  auto_complete_parent   -- boolean, default false
  sprint_enabled         -- boolean, default false
  estimate_unit          -- 'none' (default) | 'point' | 'hour' | 'tshirt' — UI เปิด Phase 4
```

ยังเป็น column ธรรมดาได้ ถ้าเกิน 8-10 ตัวค่อยพิจารณาย้ายเป็น `settings jsonb` ก้อนเดียว

## Other Phase 2 Items

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
  - งานใน project ที่ archive ไม่นับในตัวเลขทุกก้อน

- Permission layer ใช้งานเต็ม (org / team / project role)

---
