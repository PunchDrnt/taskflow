# Phase 2 — Team + Sub-task + Sprint + Chat `v1.1.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

## Remove From Org

- Owner/admin เอาคนออกจาก org ได้
- Account ของเขายังอยู่ ใช้กับ org อื่นได้ปกติ
- ชื่อยังแสดงในประวัติงานเก่าของ org นี้
- ถูกถอดออกจากทุก team และ project ใน org นี้
- งานที่ยัง assign อยู่ → แจ้ง project admin (เหมือนกรณี deactivate)
- ห้าม remove **owner คนสุดท้าย**

> ต่างจาก deactivate — deactivate ใช้กับพนักงานที่ลาออกแต่ยังอยากเก็บชื่อไว้ในรายชื่อ · remove ใช้กับคนนอกที่จบงานแล้ว

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

**ตอน anonymize ต้องล้าง `chat.identities` ด้วย** — `external_id` ของ Discord/Line เป็นข้อมูลส่วนบุคคลเหมือนกัน

**ทำไมต้อง anonymize ไม่ใช่ hard delete**

- Task, comment, activity log จะกลายเป็นเด็กกำพร้า
- ประวัติที่บริษัทต้องใช้ตรวจสอบจะหาย
- UI แสดงเป็น "ผู้ใช้ที่ถูกลบ" (แบบ GitHub/Slack)

**PDPA:** กฎหมายให้สิทธิ์ลบข้อมูลส่วนบุคคล (ชื่อ อีเมล รูป) แต่ไม่ได้บังคับให้ลบบันทึกการทำงานที่บริษัทมีสิทธิ์เก็บตามความจำเป็นทางธุรกิจ

`identity.users.status` = `'active' | 'deactivated' | 'pending_deletion' | 'deleted'` — [ดู schema เต็ม](../02-database/schema.md#schema-identity)

## Team

- สร้าง / แก้ไข / ลบทีม
- เพิ่ม-ลบสมาชิก, 1 คนอยู่ได้หลายทีม
- Role ระดับทีม: `admin` / `member` — **มี admin ได้หลายคน**

> ไม่สร้าง role "รอง lead" แยก — ใครที่ต้องกดแทนได้ตั้งเป็น admin ไปเลย เพิ่มชั้นลำดับขั้นเมื่อไหร่ ความซับซ้อนของ permission โตแบบทวีคูณ

## Assigning to a Whole Team

- `task_assignees (task_id, assignee_type: 'user' | 'team', assignee_id)`
- สมาชิกทุกคนในทีมเห็นงานใน My Tasks
- `completion_policy` ระดับ project: `anyone` (default) / `privileged`
  - `anyone` — ใครก็ได้ในทีมกดเสร็จ แต่บันทึกว่าใครกด
  - `privileged` — เฉพาะ owner / admin (org, team, project) / ผู้สร้าง task
- แสดง "เสร็จโดย [ชื่อ] เมื่อ [เวลา]" บน task เสมอ

> ล็อกไว้ที่ lead คนเดียวจะกลายเป็นคอขวด (ลาพักร้อน = งานทั้งทีมค้าง) สุดท้ายคนเลิกอัปเดตแล้วไปคุยกันใน chat แทน ซึ่งเป็นสิ่งที่ระบบนี้พยายามแก้

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

[ดู schema เต็ม](../02-database/schema.md#schema-project)

## Chat Integration — Discord

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

**Schema (สร้างตอน Phase 2 นี้เอง · ดูเต็มใน [`02-database/schema.md`](../02-database/schema.md#schema-chat-phase-2))**

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

## Project Settings Accumulated by Phase 2

```
project.projects
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

- Permission layer ใช้งานเต็ม (org / team / project role)

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
> ลบ log ตอนลบ task คือการทิ้งบันทึกว่า _ใครลบ_ ไปพร้อมกัน ซึ่งเป็นแถวที่มีค่าที่สุดในเหตุการณ์นั้น · PDPA แยกกันคนละเรื่อง — ลบข้อมูลส่วนบุคคลผ่าน anonymize ที่ `identity.users` ไม่ได้บังคับให้ลบบันทึกการทำงาน ([ดู Delete Account](#delete-account))

---
