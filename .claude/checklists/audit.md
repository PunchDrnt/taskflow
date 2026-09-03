# ขั้น 1 — Audit รอบใหม่ (2026-09-02)

ไล่ใหม่ทั้งสามคอลัมน์หลัง design แก้ครบสองรอบ · **ไม่รับข้อสรุปจาก `audit.md` เดิมมาตรงๆ**
ข้อที่เจอไว้แล้วต้องยืนยันซ้ำจากไฟล์จริง อันไหนยืนยันไม่ได้ตัดทิ้ง

**ช่อง:** `D` = docs · `S` = schema · `U` = design
**สัญลักษณ์:** `.` ยังไม่ตรวจ · `✓` ครบ · `!` ขาด/ผิด · `–` ไม่เกี่ยว

**ที่มาของแต่ละคอลัมน์**
- `D` = `docs/04-features/phase-N.md` + `03-roadmap.md` + `01-architecture.md`
- `S` = migration จริงใน `apps/api/core/src/database/migrations/` ไม่ใช่ `schema.md`
- `U` = `Taskflow Prototype.dc.html` etag `1788338645736082` (3,393 บรรทัด) และ
  `Taskflow Phase Mockups.dc.html` สำหรับ Phase 4-6

**เกณฑ์ตัดสินตอนขัดกัน** — `decisions.md` §11 · เรื่องที่กระทบ schema / การกั้นข้าม org /
เฟสของฟีเจอร์ ต้องถามก่อน ไม่ตัดสินเอง

---

## Phase 1 — `v1.0.0`

16 แถวจาก roadmap + 10 แถวที่ replan เพิ่ม (⊕)

| | D | S | U | feature | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| [x] | ! | ! | ✓ | Auth + session | docs ยังอ้าง "Phase 1 มี org เดียว" · **ไม่มีคอลัมน์ lockout บน `identity.users`** |
| [x] | ! | ✓ | ✓ | ⊕ Remember me | ไม่มีใน docs เลย · schema ไม่ต้องแก้ (เป็นค่า `sessions.expires_at`) |
| [x] | **!!** | ✓ | ✓ | ลืม / เปลี่ยนรหัสผ่าน | **docs 10 นาที · design 60 นาที — ขัดกันตรงๆ ต้องเลือก** |
| [x] | ! | ! | ✓ | ⊕ ล็อกเมื่อ login ผิดหลายครั้ง | docs ไม่มี · ต้องเพิ่ม 2 คอลัมน์บน `users` · design มีข้อความแล้ว |
| [x] | ✓ | ✓ | ✓ | โปรไฟล์ + ชื่อเล่น | |
| [x] | ! | ✓ | ✓ | Deactivate user | docs บังคับ filter "งานของคน inactive" **2 ที่** ซึ่ง `decisions.md` §6 ตัดแล้ว |
| [x] | ✓ | ✓ | ✓ | Organization + owner หลายคน | docs ละเอียดดี ใช้ต่อได้ทั้งท่อน |
| [x] | ! | ✓ | ✓ | ⊕ หลาย org ต่อคน + switcher | **schema ไม่ต้องแก้เลย** — `organization.members` รองรับอยู่แล้ว |
| [x] | ! | ✓ | ✓ | ⊕ หน้า Home ข้าม org | ไม่ต้องมีตารางใหม่ · ต้องใช้ `base()` + กรองด้วยสมาชิกภาพ |
| [x] | ! | ✓ | ✓ | สร้าง org (API only) | docs เขียน "สร้างอัตโนมัติตอน setup" · design ทำจางไว้ถูกแล้ว |
| [x] | ! | ! | ✓ | ⊕ ตาราง invitations | ยังไม่มีตาราง · design ติดป้าย P2 ถูกแล้ว |
| [x] | ✓ | ! | ✓ | Project | ขาด `color` · `key_prefix` · `archived_at` · ตัวนับเลข · **มี `icon` ที่ design ไม่ใช้** |
| [x] | ✓ | ✓ | ✓ | Project member (กั้นสิทธิ์จริง) | docs ถูกอยู่แล้ว · design แก้ครบทั้ง sidebar และหน้า Roles |
| [x] | ✓ | ✓ | ✓ | Custom status + `is_done_type` | |
| [x] | ✓ | ✓ | ✓ | `is_cancelled_type` | design ตัด cancelled ออกจากตัวหาร progress ถูกแล้ว |
| [x] | ! | ✓ | ✓ | ชุด status default ตอนสร้าง project | docs ให้ 3 อัน · ตัดสินแล้วเป็น 4 (+Cancelled) |
| [x] | ! | ✓ | ✓ | ⊕ หน้าแก้ status | docs มีแต่กติกา ไม่มีหน้าจอ · design ทำครบและ **ไม่ต้องแก้ schema** |
| [x] | ✓ | ✓ | ✓ | Task CRUD | |
| [x] | ! | ! | ✓ | ⊕ Task key | ไม่มีใน docs · ไม่มี `tasks.number` · design ประกอบจาก `base+index` (เป็นภาพ) |
| [x] | ✓ | ✓ | ✓ | Assign หลายคน | design แก้แล้วทั้ง list / card / drawer / เมนู |
| [x] | ! | ✓ | ✓ | Assignee picker | docs ให้เรียงชั้นที่ 2 ด้วย "คนที่เพิ่ง assign ล่าสุด คำนวณจาก activity log" — **design ไม่มี** |
| [x] | ! | ✓ | ✓ | Quick add | docs มี dropdown ใน My Tasks + user preference ซึ่งตัดแล้ว |
| [x] | ! | ✓ | ✓ | List view + filter + sort + group + search | docs ไม่พูดถึง sort/group · ยังมี filter inactive ที่ตัดแล้ว |
| [x] | ! | ✓ | ✓ | My Tasks | docs ไม่ได้บอกว่า default ซ่อน done/cancelled |
| [x] | ✓ | ✓ | – | Email noti เมื่อถูก assign | outbox ครบ · design ไม่ต้องมีหน้าจอ |
| [x] | – | – | – | ~~Filter งานของคน inactive~~ | **ตัดแล้ว** (`decisions.md` §6) — ต้องลบออกจาก roadmap P1 #16 |

---

## Phase 2 — `v1.1.0`

12 แถวจาก roadmap + 5 แถวที่ replan เพิ่ม (⊕)

| | D | S | U | feature | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| [x] | ✓ | ✓ | ✓ | Team + role | design มีแท็บ Teams ครบ สร้าง/แก้/ลบ/เพิ่มคน |
| [x] | ! | ✓ | ✓ | Assign ให้ทีม | docs ไม่ได้บอกว่า **หนึ่งงานได้หลายทีม** · design ทำแล้ว · schema รองรับอยู่แล้ว |
| [x] | ✓ | ✓ | ✓ | Sub-task | docs ละเอียดมาก `depth <= 1` ตรงกับ CHECK จริง |
| [x] | ✓ | ✓ | ✓ | Task Progress | design มี progress bar + `progressLabel` ตัดยกเลิกออกจากตัวหาร |
| [x] | – | – | – | ~~**Chat — Discord** ⭐~~ | **ย้ายไปหลัง Phase 3** (2026-09-02) — ดู `decisions.md` |
| [x] | ✓ | ✓ | ✓ | Sprint + `sprint_enabled` | |
| [x] | ✓ | ✓ | ✓ | ปิด sprint | design ให้ 3 ตัวเลือก carry ติดป้าย P3 ไว้ถูกแล้ว |
| [x] | ✓ | ✓ | ✓ | `completion_policy` | |
| [x] | ✓ | ✓ | ✓ | แยก sub-task ออก | design มีปุ่ม Detach + เตือนว่าจะตกไป Backlog |
| [x] | ✓ | ✓ | ✓ | Remove จาก org | design มีในเมนู `⋯` ทำจางป้าย P2 |
| [x] | ✓ | ✓ | ! | ลบ account + anonymize | **ไม่มีในดีไซน์เลย** — 🟢 ของ P2 ยอมรับได้ แต่ต้องรู้ว่ายังไม่มีหน้าจอ |
| [x] | ✓ | ✓ | ✓ | Activity log ในหน้า task | design รวมเป็นแท็บเดียวกับ comment ("Comments & activity") |
| [x] | ! | ! | ✓ | ⊕ Archive project | `phase-2.md` ไม่พูดถึงเลย · ขาด `archived_at` |
| [x] | ! | ✓ | ✓ | ⊕ Danger zone | `phase-2.md` ไม่พูดถึงเลย |
| [x] | ! | ! | ✓ | ⊕ Invitation API + หน้าจอ | `phase-2.md` ไม่พูดถึงเลย · ยังไม่มีตาราง |
| [x] | ! | ! | – | ⊕ RLS | อยู่ใน `01-architecture.md` แต่ **ไม่อยู่ใน `phase-2.md`** · ยังไม่มี policy สักอัน |
| [x] | ! | ✓ | ✓ | ⊕ หลายทีมต่อหนึ่งงาน | docs เขียนไม่ชัด · design ทำแล้ว · `task.assignees` รองรับอยู่แล้ว |

---

## Phase 3 — `v1.2.0` ← ขึ้น server จริงตรงนี้

10 แถวจาก roadmap (ตัด tag เหลือ 9) + 2 แถวที่ replan เพิ่ม (⊕)

| | D | S | U | feature | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| [x] | ✓ | ✓ | ✓ | Kanban board | `sort_order` LexoRank พร้อมแล้ว · design แสดง sub-task เป็นการ์ดแยกตาม docs |
| [x] | ✓ | ✓ | ✓ | Comment + thread | `discussion.comments.parent_comment_id` มีอยู่แล้ว |
| [x] | – | – | – | ~~**Chat — Line** ⭐~~ | **ย้ายไปหลัง Phase 3** (2026-09-02) |
| [x] | ✓ | ✓ | ✓ | ไฟล์แนบ | `discussion.attachments` + Garage พร้อม |
| [x] | ✓ | **!** | ✓ | แจ้งเตือนครบชุด | **ไม่มีตาราง in-app notification** — ดูข้อ 2 |
| [x] | ✓ | ✓ | ✓ | Sprint board + carry over | design ให้ 3 ตัวเลือกตรงกับ docs เป๊ะ |
| [x] | – | – | – | ~~Table view~~ | **ตัดแล้ว** (2026-09-02) — ลบจาก roadmap P3 #7 และ `phase-3.md` |
| [x] | – | – | – | ~~Tag / Label~~ | **ตัดแล้ว** — ลบจาก roadmap P3 #8 และ `phase-3.md` |
| [x] | ✓ | ✓ | **!** | Activity log — feed + filter | design มีแค่ feed ต่อ task ใน drawer · **ไม่มี feed ระดับ project** |
| [x] | ✓ | ✓ | **!** | **Stale detection** ⭐ | docs เขียนดีมาก · schema พร้อม · **design ไม่มีสักที่** |
| [x] | ! | ! | ✓ | ⊕ Inbox เต็มรูปแบบ | `phase-3.md` ไม่มีคำว่า inbox เลย · ไม่มีตาราง · design วาดครบ |
| [x] | ! | ✓ | ✓ | ⊕ filter My tasks ปรับเอง | ไม่มีใน `phase-3.md` |

### ที่เจอใน Phase 3

1. ~~**Chat ทั้งสองเจ้าไม่มีอะไรรองรับเลย**~~ — **ปิดแล้ว: ย้ายไปหลัง Phase 3** (2026-09-02)
   เคยเป็น `!` ครบสามช่องในสองเฟสติดกัน ตอนนี้ออกนอกกรอบ P1-3 แล้ว

2. **ไม่มีตาราง in-app notification** — design วาด Inbox เต็ม (กระดิ่ง + เลข unread + Mark all read
   + สถานะอ่าน/ยังไม่อ่านรายอัน) แต่ `notify.outbox` เป็น**คิวส่งออก ไม่ใช่กล่องขาเข้า** ·
   `status`/`sent_at` แปลว่าส่งถึงหรือยัง ไม่ใช่อ่านหรือยัง · และ retention **ลบแถว outbox ทิ้งจริง**
   ซึ่งจะลบประวัติแจ้งเตือนไปด้วยถ้าเอามาใช้ปนกัน → ต้องมีตารางของตัวเอง ตัดสินตอนขั้น 2

3. **`decisions.md` §4 เขียนว่า "จบ Phase 3 = หน้าตาเท่า design ยกเว้น 3 อย่าง"** — ไม่จริงทั้งสองทาง
   นอกจาก design จะมีของเกินกรอบ 3 อย่าง (แท็บ view ที่ save ได้ · ⌘K · org logo/timezone)
   **design ยังขาดของ P3 อีก 3 อย่าง** — Table view · stale detection · หน้าจอ chat
   ประโยคนี้ต้องเขียนใหม่ตอนขั้น 2 ให้บอกทั้งสองทิศ

---

## Phase 4-6 — เช็คแค่ว่ามีตารางรองรับ

`S` อย่างเดียว · `–` = ไม่ต้องมีตาราง

### Phase 4 — `v1.3.0` (9 แถวเดิม + 2 แถวที่ย้าย chat เข้ามา)

| | S | feature | ตาราง |
| --- | --- | --- | --- |
| [x] | ✓ | Custom field | `field.definitions` + `tasks.custom_fields` (GIN index รอ P4 ตามที่ migration เขียนไว้) |
| [x] | ! | View config | `sort_json` default `'{}'` **ผิดทรง** ควรเป็น `'[]'` · ขาด `sort_order` `is_default` |
| [x] | – | Dashboard | คำนวณจากของที่มี |
| [x] | ✓ | **Handover mode** ⭐ | `task.assignees` + `audit.logs` พอ — การโอนคือ update แถว assignee |
| [x] | ✓ | Calendar view | `tasks.due_date` · `view.views.type` รับ `'calendar'` อยู่แล้ว |
| [x] | ! | Group by / Sort | ปัญหาเดียวกับ View config |
| [x] | ✓ | View ส่วนตัว | `views.owner_id` (null = view กลาง) |
| [x] | – | Export Excel / PDF | |
| [x] | ✓ | Estimate + Velocity + Burndown | `tasks.estimate` + `projects.estimate_unit` |
| [x] | ! | ⊕ **Chat — Discord** ⭐ | schema `chat` สร้างไว้แล้ว **แต่ไม่มีตาราง** · `schema.md` เขียนสองตารางไว้แล้ว |
| [x] | ! | ⊕ **Chat — Line** ⭐ | ตารางเดียวกับ Discord |

### Phase 5 — `v2.0.0`

| | S | feature | ตาราง |
| --- | --- | --- | --- |
| [x] | ✓ | Rich text `/` command | `tasks.description text` |
| [x] | ! | Template | ไม่มีตาราง และ **ไม่มีใน `schema.md`** ด้วย |
| [x] | ! | Recurring task | ไม่มีตาราง และไม่มีใน `schema.md` |
| [x] | ! | **Semantic search + ตรวจงานซ้ำ** ⭐ | **ไม่มี pgvector** · ไม่มี `task.task_embeddings` — ดูข้อ 2 |
| [x] | ! | Nested page 3 ชั้น | `CONSTRAINT tasks_depth_within_limit_check CHECK (depth <= 1)` |
| [x] | ! | Timeline / Gantt | มีแต่ `due_date` **ไม่มีวันเริ่ม** — Gantt ต้องมีสองปลาย |
| [x] | ! | Time tracking | ไม่มีตาราง |
| [x] | ✓ | `all_assignees` | เป็นค่าที่สามของ `completion_policy` ซึ่ง **ไม่มี CHECK** เพิ่มค่าได้ฟรี |
| [x] | ! | **Task dependency** | ไม่มี `task.dependencies` — ดูข้อ 2 |
| [x] | **!!** | **Automation** | `schema.md` มี `## Schema automation (Phase 5)` **แต่ `CreateSchemas` ไม่ได้สร้าง schema นี้** — ดูข้อ 1 |

### Phase 6 — `v2.1.0`

| | S | feature | ตาราง |
| --- | --- | --- | --- |
| [x] | – | Mobile / PWA | |
| [x] | ! | Global search | ไม่มี `pg_trgm` และไม่มีคอลัมน์ `tsvector` — `CreateExtensions` มีแค่ `citext` |
| [x] | – | Performance tuning | |
| [x] | – | Light mode | |
| [x] | ! | **Chat — Microsoft Teams** | ตาราง `chat.*` เดียวกัน |
| [x] | ! | Integration อื่น | Google Calendar / Slack / webhook — ไม่มีตาราง ไม่มีสเปก |
| [x] | – | Real-time collaboration | |

### ที่เจอใน Phase 4-6

1. **`schema.md` อธิบาย schema ที่ฐานข้อมูลไม่มี** — `## Schema automation (Phase 5)` พร้อมตาราง
   `rules` เขียนไว้เต็ม แต่ `CreateSchemas` สร้างแค่ 11 อันและ **ไม่มี `automation`**
   (`reset.ts` กับ `test/database.ts` ก็ลิสต์ 11 อันตามกัน) · เป็น docs ขัดกับโค้ดตรงๆ
   ซึ่ง `CLAUDE.md` บอกเองว่าแย่กว่าไม่มี docs

2. **`phase-5.md` ลิงก์ไปหาสเปกที่ไม่มีอยู่ 2 ที่** — Task dependency เขียนว่า
   *"[Schema เต็ม + composite FK + recursive CTE กัน cycle](../docs/02-database/schema.md#schema-task)"* แต่ใน
   `schema.md` หัวข้อ `task` มีแค่ `tasks` กับ `assignees` ไม่มี `dependencies`
   · `task.task_embeddings` ก็เขียนไว้ใน `phase-5.md` แต่ไม่มีใน `schema.md`

3. **ไม่มี pgvector** — `CreateExtensions` มี `citext` อย่างเดียว · semantic search เป็น 🟢
   ของ P5 ยังไม่ด่วน แต่ต้องรู้ว่าต้องเพิ่ม extension ไม่ใช่แค่เพิ่มตาราง

4. **หลักการ "Schema ครบทุก module ตั้งแต่ Phase 0" จริงถึงแค่ Phase 4** — P5 มี 7 ใน 10 แถว
   ที่ไม่มีตาราง · **ไม่ใช่ปัญหา** เพราะทั้งหมดเป็น*ตารางใหม่* ซึ่งเพิ่มบนฐานข้อมูลที่มีข้อมูลแล้ว
   ราคาถูก ที่แพงคือการแก้ตารางเดิม → แต่ประโยคใน `03-roadmap.md` Phase 0 แถวที่ 3 ต้องเขียนใหม่
   ให้ตรงกับที่ทำจริง ไม่ใช่ปล่อยให้อ่านแล้วเข้าใจว่าครบทุกเฟส
