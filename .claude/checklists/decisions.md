# Decisions — replan รอบ design (2026-09-01)

บันทึกสิ่งที่ตัดสินไปแล้วจากการ review design (`Taskflow Prototype.dc.html`) เทียบกับ
schema จริง **เป็น scratch state ไม่ใช่ spec** — ขั้นถัดไปคือย้ายเข้า `docs/` แล้วไฟล์นี้
จะเหลือไว้เป็นบันทึกว่าทำไมถึงตัดสินแบบนั้น

> **ระหว่างช่วง replan นี้ ไฟล์นี้ใหม่กว่า `docs/`** — `docs/` หลายที่ยังเขียนว่ามี org เดียว
> ซึ่งไม่จริงแล้ว เมื่อขั้นที่ 2 จบและ `docs/` ตามทันแล้ว กติกาเดิมของ repo กลับมาใช้ตามปกติ
> (docs = spec, checklist = scratch)
>
> ถ้าเจอที่ขัดกันระหว่างทาง: **เรื่องเล็กตัดสินเองแล้วจดไว้ · เรื่องใหญ่ถามก่อน**
> เรื่องใหญ่คือสามอย่างนี้ — กระทบ schema · กระทบการกันข้าม org · เปลี่ยนว่า feature อยู่เฟสไหน

---

## 1. กรอบใหญ่ที่เปลี่ยน

| | เดิม | ใหม่ |
| --- | --- | --- |
| จำนวน org ต่อคน | Phase 1-6 มี org เดียว | **หลาย org ต่อคนได้ตั้งแต่ Phase 1** |
| design ที่วาดไว้ | เข้าใจว่าเป็น Phase 1 | **เป็นปลายทางของ Phase 3** |
| ขึ้น server จริง | จบ Phase 1 (`v1.0.0`) | **จบ Phase 3** |
| เลข version | — | คงเดิม แต่ประโยคนิยาม `v1.0.0` ผิดแล้ว ต้องแก้ |

**ผลที่ตามมา:** schema ต้องครบถึง Phase 3 ก่อน deploy — หลังจากนั้นแก้ตารางฟรีไม่ได้อีก
ตอนนี้ยังแก้ `CREATE TABLE` เดิมได้ (ไม่มีอะไร deploy)

### ทำไมถึงมีหลาย org

คนหนึ่งคนมีงานประจำ + งานนอก = อย่างน้อย 2 org และอาจเป็น **เจ้าของ** org ตัวเอง
แปลว่าข้อมูลของนายจ้างกับงานส่วนตัวอยู่ในฐานข้อมูลเดียวกัน คนละเจ้าของ

→ cross-org isolation ไม่ใช่ของเผื่ออนาคตอีกต่อไป และ **RLS ที่วางไว้ Phase 2 ต้องไม่เลื่อน**
→ policy ต้องเป็น "org ที่ฉันเป็นสมาชิก" ไม่ใช่ "org ที่กำลังเปิด" ไม่งั้นหน้า Home ว่าง

---

## 2. Phase 1 — `v1.0.0`

Login → Home (ข้าม org) → เลือก org → Project → คลิกงาน → drawer

| หน้าจอ | มีอะไร |
| --- | --- |
| Login | email/password · remember me · ลืมรหัสผ่าน · ล็อกเมื่อผิดหลายครั้ง |
| Home | ตัวเลข 3 ก้อน · งานใกล้ถึงกำหนด · รายชื่อ org |
| Sidebar | org switcher · My tasks · project · Settings |
| My tasks | งานที่ assign ให้เราตรงๆ · **default ซ่อน done/cancelled** |
| Project (list) | quick add · filter/sort/group **เก็บใน URL ไม่ save เป็น view** · คอลัมน์ key/ชื่อ/priority/status/due/assignee |
| Task drawer | ชื่อ · คำอธิบาย · status · **assignee หลายคน** · due · priority · created by |
| Project settings | ชื่อ · สี · **แก้ status** |
| Org settings | สมาชิก · role · deactivate |
| Profile | ชื่อ · ชื่อเล่น · email · เปลี่ยนรหัส |
| เบื้องหลัง | อีเมลเด้ง **เมื่อถูก assign อย่างเดียว** |

**ยังไม่มี:** sub-task · sprint · board · comment · activity feed · ทีม · inbox · แท็บ view · ⌘K · archive · หน้าจอ invite

## 3. Phase 2 — `v1.1.0`

ทีม (My tasks แตก section + chips + สวิตช์) · sub-task (แถวเยื้อง + progress) · sprint
(เปิดต่อ project + ปิด sprint + carry) · `completion_policy` + ถามก่อนปิด parent ·
archive project · danger zone · เอาคนออกจาก org · **invitation API + หน้าจอ** ·
activity log ใน drawer · Discord · **RLS**

## 4. Phase 3 — `v1.2.0` ← ขึ้น server จริงตรงนี้

Kanban board · sprint board + carry over · comment + thread · ไฟล์แนบ ·
**inbox เต็มรูปแบบ** · Line · table view · stale detection ·
**filter ของ My tasks ให้ผู้ใช้ปรับเอง** (ทางเดียวที่จะเห็นงานใน project ที่ archive)

จบ Phase 3 = หน้าตาเท่า design ยกเว้น 3 อย่างที่เกินกรอบ:
แท็บ view ที่ save ได้ (P4) · ⌘K (P6) · org settings ส่วน logo/timezone/defaults (P3+)

### ตัด Tag / Label ออก (ไม่ใช่เลื่อน)

`03-roadmap.md` แถวที่ 8 ของ Phase 3 และบรรทัดใน `phase-3.md` — **ลบทิ้งทั้งคู่ตอนขั้น 2**
พร้อมเขียนเหตุผลไว้ ตัดออกไม่ใช่เลื่อน เพราะเลื่อนแปลว่าต้องกลับมาคิดใหม่อีกรอบ

- ตัวอย่างที่ docs ยกมาเอง ทับกับของที่มีอยู่แล้วทั้งสองอัน — "ด่วน" คือ `priority`
  (มี Urgent อยู่แล้ว) · "รอลูกค้า" **คือ status** ซึ่งกำหนดเองต่อ project ได้อยู่แล้ว
- ไม่มีทั้งตาราง entity สเปก และไม่มีในดีไซน์ — ดีไซน์ที่วาดจาก docs ชุดเดียวกันนี้
  วาดของ P4-6 ไว้ด้วยซ้ำแต่ไม่ได้วาด tag เลยสักที่
- **custom field แทนไม่ได้** — `field.definitions.project_id` เป็น `NOT NULL` ผูกกับ project
  เดียว · จะถามข้าม project ต้องไล่หา field ในทุก project แล้ว map uuid เอง
  (`tasks.custom_fields` เก็บ key เป็น UUID ของ field) ซึ่งคือสิ่งที่ tag มีไว้ไม่ให้ต้องทำ
- **ที่ยอมเสีย:** การจัดหมวดที่ตัดขวางทุก project แบบที่ status ทำไม่ได้ เช่น
  "งานของลูกค้า A" ที่กระจายอยู่ทั้ง Sales และ Dev · บริษัท ~100 คนที่มี 4 project
  ยังไม่คุ้มกับสองตาราง (`task.tags` + `task.task_tags`)
- อยากได้เมื่อไหร่ค่อยเพิ่ม ตอนนั้นจะมีเคสจริงให้ออกแบบด้วย ดีกว่าเดาตอนนี้

---

## 5. Task key

- รูปแบบ `PREFIX-เลข` เช่น `DEV-120` — prefix เก็บบน project, เลขเก็บบน task, **ประกอบตอนแสดงผล**
  (เปลี่ยน prefix แล้ว key เปลี่ยนทั้งระบบทันที ไม่ต้อง backfill)
- **บังคับกรอกตอนสร้าง project** · uppercase · `^[A-Z][A-Z0-9]{1,5}$`
- **prefix ซ้ำกันได้ในหนึ่ง org** — ผู้ใช้กรอกเอง ยอมรับว่า `TF-120` ชี้ได้ 2 งาน
  (ลิสต์แสดงชื่อ project ข้างเลขอยู่แล้ว · ค้นหาคืนหลายผลให้เลือก)
- เลขต่อ project เริ่มที่ 1 · **sub-task มีเลขของตัวเอง** (ไม่ใช่ `120.1`)
- **ห้ามย้าย task ข้าม project เด็ดขาด**
- ไม่เก็บ `previous_key_prefix`
- 🔒 **unique `(project_id, number)` เป็น index เต็ม ไม่ partial** — ตั้งใจแหกกฎ soft-delete
  เพราะเลขที่ถูกลบต้องไม่ถูกแจกซ้ำ ไม่งั้น key ที่แปะไว้ชี้ผิดงาน

## 6. ที่เหลือ

| หัวข้อ | ตัดสิน |
| --- | --- |
| Assignee | หลายคนได้ (P1) · แสดง 3 avatar แล้วยุบ `+N` · คนกับทีมปนกันได้ (P2) · My tasks นับงานของทีมด้วย |
| Status | ชุด default ตอนสร้าง project: To do · In progress · Done · Cancelled — **hardcode ในโค้ด ไม่มีชุดกลางระดับ org** |
| | ลบ status ที่มีงานค้างไม่ได้ (FK RESTRICT อยู่แล้ว) |
| Project member | **กั้นสิทธิ์จริงตั้งแต่ P1** — member เห็นเฉพาะ project ที่ตัวเองเป็นสมาชิก |
| | org owner/admin เห็นทุก project ใน org ตัวเอง (กันเคส project ที่ไม่มีสมาชิกเหลือ) |
| | assign คนนอก project ได้ — ระบบเพิ่มเข้า project ให้อัตโนมัติพร้อมถามยืนยัน · ได้สิทธิ์ `member` |
| Quick add | **เฉพาะในหน้า project** · My Tasks ไม่มี — ถ้าเพิ่มทีหลังใช้ `localStorage` จำ project ล่าสุด ไม่ต้องมีตาราง user preference |
| สร้าง org | Phase 1-3 **มี API ไม่มี UI** |
| Invitation | **ใส่ตารางตอนนี้** · API + UI รอ Phase 2 · Phase 1 ใช้ seed เพิ่มคนเข้า org |
| | Phase 2 คนที่ยังไม่มี account กด accept แล้วสมัครตรงนั้นเลย |
| Deactivate | งานที่ค้างคาไว้เหมือนเดิม · **ตัด filter "งานของคน inactive" ทิ้ง** (เดิม P1 #16) |
| Archive project | งานข้างในไม่โผล่ใน My tasks · ดูย้อนหลังได้ผ่าน filter ใน P3 |
| Inbox | **Phase 3** คู่กับ "แจ้งเตือนครบชุด" |
| View ที่ save ได้ | **Phase 4** ตามเดิม |
| RLS | **Phase 2 ตามเดิม ห้ามเลื่อน** |

## 7. UI

- **layout ตาม design** ปรับได้เฉพาะเพื่อให้เข้ากับ component ที่มีอยู่
- **atomic design ใช้ที่ `apps/web/client` เท่านั้น** — `packages/ui` ไม่แตะ

**หน้าจอทั้งหมดมี 7 อัน** — `home` `mine` `project` `board` `members` (org settings)
`psettings` (project settings) `profile`

ที่อยู่ของสามหน้าจอที่เพิ่มรอบสุดท้าย (สั่ง design ไปแล้ว · ยืนยันจากดีไซน์จริงตอนขั้น 3):

| ของ | อยู่ที่ | เฟส |
| --- | --- | --- |
| Activity feed ระดับ project + filter 3 ตัว | แท็บที่สามในหน้า `project` ต่อจาก List / Board | P3 |
| Stale detection + setting จำนวนวัน | แถบเหนือรายการงานใน `project` · setting อยู่ `psettings` | P3 |
| ลบบัญชีตัวเอง (danger zone) | ท้ายหน้า `profile` | P2 |

เหตุการณ์ระดับบริหารในแท็บ Activity (เพิ่ม/ถอดคน, แก้ settings) **เห็นเฉพาะ admin/owner**
ส่วนแถบ stale detection **ทุกคนใน project เห็นเท่ากัน**

---

## 8. Schema ที่ต้องแก้ (แก้ `CREATE TABLE` เดิม ไม่ใช่ `ALTER`)

| ตาราง | เพิ่ม |
| --- | --- |
| `project.projects` | `color` · `archived_at` · `key_prefix` (NOT NULL, CHECK uppercase) · ตัวนับเลขงาน |
| `task.tasks` | `number` + unique เต็ม `(project_id, number)` |
| `view.views` | `sort_json` default `'[]'` (เดิม `'{}'` ผิดทรง) · `sort_order` · `is_default` |
| `organization.invitations` | ตารางใหม่ — ไม่มี `deleted_at` (มี `accepted_at`/`revoked_at` แล้ว) |

ปิดท้ายด้วย `db:reset` + `schema-drift.spec.ts` ครั้งเดียว · schema doc ต้องอยู่คอมมิตเดียวกับ migration

## 9. design ที่ต้องแก้

1. **assignee หลายคน** — ตอนนี้ทุกที่มี avatar เดียว เมนูเลือกทับค่าเดิม
2. **หน้าแก้ status ต่อ project** — ไม่มีเลย ทั้งที่เป็น P1 🔴
3. **New project ต้องมีช่อง key prefix** และต้องได้ status ชุด default (ไม่งั้นรับ task ไม่ได้ — `status_id` NOT NULL)
4. **แท็บ Invitations + copy หน้า no-org** — Phase 1 ยังไม่มี
5. **`Urgent` หายจากเมนูแก้ priority** (ลิสต์มี 4 ค่า เมนูมี 3)
6. **ที่ทางของ project ที่ archive แล้ว** — ไม่มีในดีไซน์
7. **sidebar ต้องแสดงเฉพาะ project ที่เป็นสมาชิก** — ตอนนี้แสดงทุกอัน
8. **หน้าจัดการสมาชิกของ project** — ไม่มีเลย (project settings มีแค่ ชื่อ/สี/sprint/completion/archive)
9. **assignee picker** ต้องมีปุ่ม "ค้นหาทั้งองค์กร" + ถาม "เพิ่มเข้า project ไหม" — ตอนนี้เป็นลิสต์แบน
10. **หน้า Roles เขียนตรงข้าม** — *"every member of the organization can open every project"* ไม่จริงแล้ว

## 10. ยกเลิก

- **PR B (auth core)** — แผนเดิมเป็นโมฆะ เขียนใหม่หลัง docs เสร็จ
- **Prisma/Kysely/ts-rest** — ประเมินแล้ว 2026-08-30 ไม่เอา

---

## 11. ลำดับความสำคัญตอนเขียนโค้ด

**เป็นตัวตัดสินตอนสองข้อชนกัน ไม่ใช่ลำดับการทำงาน** — ไม่ใช่ "ทำ security ให้เสร็จก่อนค่อยแตะ UI"
คนละเรื่องกับ `definition-of-done.md` ซึ่งบอกว่าอะไรต้องจริงก่อนปิดงาน

1. **ข้อมูลไม่พัง และไม่รั่ว** — correctness กับ security อยู่ด้วยกัน ไม่แลกกัน
   `org_id` isolation เป็นทั้งสองอย่างพร้อมกัน · แถวรั่วแล้วรั่วเลย ข้อมูลพังแล้วสร้างคืนไม่ได้
2. **รูปร่างของ schema กับ API** — แก้ `tasks` ตอนมีข้อมูล 6 เดือนคือ full-table migration
   บวกทุก client · แพงกว่า refactor เยอะ
3. **UX + performance**
4. **Clean code**
5. **UI**

เกณฑ์ที่เรียงคือ **พลาดแล้วย้อนแพงแค่ไหน** ไม่ใช่คำไหนฟังดูสำคัญกว่า · UI อยู่ท้ายเพราะแก้วันไหน
ก็ได้ **ไม่ใช่เพราะส่งขี้เหร่ไปก่อนได้** — design เสร็จแล้วและมันคือสเปกของ UI ไม่ใช่ของที่เอาไว้แลก

ข้อ 3 อยู่เหนือข้อ 4 แปลว่า denormalize / เพิ่ม index / เพิ่ม cache ชนะความสะอาดได้ —
**เมื่อวัดแล้ว ไม่ใช่เดา** อย่างคอลัมน์ `depth` บน `task.tasks` ที่เลือกไว้แล้วพร้อมเหตุผลใน migration

---

## 12. ตัดสินเพิ่มระหว่าง audit รอบใหม่ (2026-09-02)

**ก. ลิงก์ reset password อายุ 30 นาที** — `phase-1.md:9` เขียน 10 นาที · design เขียน 60 นาที
เลือกตรงกลาง **30 นาที** · แก้ทั้งสองที่ตอนขั้น 2 (docs และส่งกลับให้ design แก้ตัวเลข)
เก็บเป็นค่าใน `env.ts` ไม่ hardcode · token ใช้ครั้งเดียวอยู่แล้ว (`used_at`) ความเสี่ยงจริง
คือถูกใช้ซ้ำ ไม่ใช่ความยาวของหน้าต่างเวลา

**ข. `project.projects.icon` เอาออก ใส่ `color` แทน** — design ใช้จุดสีอย่างเดียว ไม่มี icon เลย
`icon` เป็นคอลัมน์ที่ไม่มีใครเซ็ต · ตอนนี้ยังลบได้ฟรีเพราะยังไม่ deploy · `color` เก็บเป็น
**token จาก palette 8 สี ไม่ใช่ hex** ให้ตรงกับ `project.statuses.color` ที่ทำแบบนี้อยู่แล้ว

→ `decisions.md` §8 แถว `project.projects` แก้เป็น: **ลบ** `icon` · **เพิ่ม** `color`,
`archived_at`, `key_prefix`, ตัวนับเลขงาน

---

## 13. จัดการไฟล์ migration (เพิ่มเข้ามา 2026-09-02)

งานหนึ่งชิ้นแยกต่างหาก **คร่อมขั้น 2 กับขั้น 4** — ขั้น 2 ตัดสินว่าตารางหน้าตายังไง
ขั้น 4 ตัดสินว่าลงไฟล์ไหน · ตอนนี้มี 13 ไฟล์ ยังไม่ deploy อะไรเลยจึงยังจัดใหม่ได้ฟรี

**ที่รู้แล้วว่าต้องแตะ**

| ไฟล์เดิม | ทำอะไร |
| --- | --- |
| `CreateIdentityUsers` | เพิ่ม `failed_login_attempts` · `locked_until` |
| `CreateOrganization` | เพิ่มตาราง `organization.invitations` |
| `CreateProject` | **ลบ** `icon` · เพิ่ม `color` `key_prefix` `archived_at` + ตัวนับเลขงาน |
| `CreateTask` | เพิ่ม `number` + 🔒 unique เต็ม `(project_id, number)` |
| `CreateFieldAndView` | `sort_json` default `'[]'` · เพิ่ม `sort_order` `is_default` |
| ใหม่ | `chat.identities` + `chat.channels` (schema `chat` สร้างไว้แล้วใน `CreateSchemas`) |
| ใหม่ | RLS policy (Phase 2 · ห้ามเลื่อน) |

**คำถามที่ต้องตอบตอนลงมือ**

1. **ตารางใหม่ลงไฟล์ไหน** — `invitations` แก้ `CreateOrganization` เดิม · `chat.*` เป็นไฟล์ใหม่
   แต่ไฟล์ใหม่จะได้ timestamp วันนี้ ซึ่งไป**ต่อท้าย `SeedSystemPermissions`** ทำให้ลำดับอ่านแล้วงง
   → ยังไม่ deploy จึง **renumber ได้ฟรี** ตัดสินว่าจะ renumber หรือยอมให้ seed ไม่อยู่ท้ายสุด
2. **RLS ลงยังไง** — policy แยกไฟล์เดียวต่อท้าย หรือแทรกในไฟล์ของแต่ละตาราง
3. **squash หรือเก็บ 13 ไฟล์** — docblock ในแต่ละไฟล์คือบันทึกว่าทำไมตารางเป็นแบบนั้น
   squash แล้วบันทึกนั้นต้องไปอยู่ที่อื่น
4. **`chat.identities` / `chat.channels` soft delete ไหม** — ถ้า soft delete ต้องไปอยู่ใน
   `AGGREGATE_CHILDREN` หรือ `ROOTS` ใน `shared/entity/cascade-soft-delete.ts` ไม่งั้น test แดง

**ทุกครั้งที่แตะตาราง ต้องตามไปสามที่**
`database/entities.ts` (ลิสต์ชัดเจน ไม่ใช้ glob) · `*.entity.ts` ของตารางนั้น ·
`docs/02-database/schema.md` (คอมมิตเดียวกัน) · ปิดท้าย `db:reset` + `schema-drift.spec.ts`

> `migration:create` เขียน `import { MigrationInterface, QueryRunner }` เป็น value import
> ซึ่งพังใต้ Vitest — lint-staged แก้ให้ตอน commit ไม่ต้องแก้มือ

### แยก seed เป็นสองไฟล์ (ตัดสิน 2026-09-02)

```
src/database/seed/
  required.ts   →  db:seed:required   ต้องมีทุกที่รวม production · idempotent · ไม่ปฏิเสธ production
  demo.ts       →  db:seed            ข้อมูลตัวอย่าง · ปฏิเสธ production (ของเดิม ย้ายมาเฉยๆ)
```

**เส้นแบ่งที่ทำให้ปลอดภัย** — ไม่ใช่ "reference data อยู่ migration" แบบที่เคยว่าไว้

| | อยู่ไหน | ตัวอย่าง |
| --- | --- | --- |
| ข้อมูลที่ **migration อื่นพึ่งพา** | migration | system user `00000000-…` — ทุก `created_by` เป็น FK RESTRICT ชี้มาที่แถวนี้ และ migration อื่นก็ insert แถวที่อ้างถึงมัน |
| ข้อมูลที่ **ไม่มีใครพึ่ง** | `seed/required.ts` | permission key 6 อัน — `role_permissions` มี FK ชี้ตาราง แต่ **ไม่มี migration ไหน insert แถว mapping เลย** จึงย้ายได้ |

ตรวจแล้วว่าเงื่อนไขที่สองเป็นจริง: FK เดียวที่ชี้มา `identity.permissions` คือ
`identity.role_permissions.permission_id` และ docs ตั้งใจไม่ seed mapping นั้น

**ต้องแก้ deploy ด้วย** — `deploy/compose.yml` `api-migrate` ตอนนี้สั่ง typeorm CLI ตรงๆ
เป็น exec array ไม่มี shell → เปลี่ยนเป็น entrypoint เดียวที่ `runMigrations()` แล้วรัน
required seed ต่อ (ทรงเดียวกับ `reset.ts` ที่เรียก `runMigrations()` เองอยู่แล้ว)
ไม่ใช้ `sh -c "... && ..."`

**ของแถมที่ได้จากการย้าย** — `SeedSystemPermissions` ตอนนี้ต้องเขียนรายการ permission ซ้ำ
แทนที่จะ `import { SYSTEM_PERMISSIONS }` เพราะ *"แก้ object แล้วต้องไม่เปลี่ยนสิ่งที่ migration
ทำไปแล้วบน live database"* · seed ที่รันทุก deploy **ไม่มีข้อจำกัดนั้น** — import ตรงได้เลย
และ `test/schema-invariants.spec.ts` ท่อนที่คอยจับ drift ระหว่างสองรายการก็หมดหน้าที่

**ต้องตัดสินตอนเขียน:** required seed ใช้ `ON CONFLICT DO NOTHING` (เพิ่ม key ใหม่ได้ · เปลี่ยนชื่อ
หรือลบ key แล้วแถวเก่าค้าง) หรือ upsert + ลบของที่ไม่อยู่ในลิสต์ · 6 แถวที่ยังไม่มีใครอ่านจนถึง
Phase 7 — DO NOTHING พอ แต่ต้องเขียนกำกับว่าเลือกแล้ว

**ลำดับงาน** — ย้าย seed กับ renumber ไฟล์ทำพร้อมกันครั้งเดียวหลัง schema นิ่ง
`SeedSystemPermissions` จะหายไปจาก migration พอดี เหลือ 12 ไฟล์ + 2 ไฟล์ใหม่ (chat, RLS)

### ตัด Table view ออก (2026-09-02)

`03-roadmap.md` Phase 3 แถวที่ 7 และบรรทัดใน `phase-3.md` — **ลบทั้งคู่ตอนขั้น 2** พร้อมเหตุผล
ตัดออกไม่ใช่เลื่อน แบบเดียวกับ tag

- docs เป็น bullet เปล่า ไม่มีสเปกสักบรรทัด — ไม่มีอะไรให้ implement อยู่แล้ว
- design ไม่มี มีแค่ `list` กับ `board`
- list view ที่มี filter/sort/group/คอลัมน์ปรับได้ ทำสิ่งที่ table view ทำอยู่แล้วเกือบหมด
  ส่วนที่ต่างจริง (แก้ค่าในตารางตรงๆ แบบ spreadsheet) เป็นของที่มาคู่กับ custom field ใน P4
- ที่ยอมเสีย: การแก้หลายงานรวดเดียวแบบ spreadsheet — ถ้าอยากได้จริงค่อยคิดตอน P4
  ซึ่งตอนนั้นจะมี `view.columns` ให้ต่อพอดี

**Phase 3 เหลือ 8 ฟีเจอร์**

### ย้าย Chat integration ไปหลัง Phase 3 (2026-09-02)

Discord (เดิม P2 🔴⭐) และ Line (เดิม P3 🔴⭐) **ย้ายออกจากกรอบ Phase 1-3 ทั้งคู่**
Teams อยู่ P6 ตามเดิม · ❓ ใน `phase-2.md` ที่ค้างอยู่ตามไปด้วย ไม่ต้องปิดตอนขั้น 2 แล้ว

**ผลที่ตามมา**

- ปิดรูใหญ่สุดที่ audit เจอ — chat เคยเป็น `!` ครบสามช่อง (docs · schema · design) ในสองเฟสติดกัน
  ตอนนี้กลายเป็น "ยังไม่ถึงคิว" ซึ่งไม่ใช่ปัญหา
- **`chat.identities` / `chat.channels` ไม่ต้องมีก่อน deploy อีกต่อไป** — และไม่เป็นปัญหา
  เพราะเป็น**ตารางใหม่** การเพิ่มตารางใหม่บนฐานข้อมูลที่มีข้อมูลแล้วถูก ที่แพงคือการแก้ตารางเดิม
  · schema `chat` ที่ `CreateSchemas` สร้างไว้แล้วปล่อยว่างไว้ได้ ไม่ต้องลบ
- `phase-2.md` ท่อน anonymize เขียนว่า *"ตอน anonymize ต้องล้าง `chat.identities` ด้วย"`
  → ต้องติดป้ายเฟสกำกับตอนขั้น 2 ไม่งั้นจะกลายเป็นสเปกที่อ้างตารางที่ยังไม่มี
- **ของที่ deploy จบ Phase 3 จะเป็น task tracker มาตรฐาน ไม่มีตัวต่างที่ roadmap เขียนไว้ว่า
  "ลอกยากกว่าราคา"** — เป็นการเลือกส่งแกนหลักให้เสร็จก่อน ไม่ใช่การมองข้าม

**ตัดสินแล้ว: Phase 4 ช่วงหลัง** (2026-09-02) — ต่อท้ายรายการ P4 เป็นแถวที่ 10 (Discord)
และ 11 (Line) · ระดับความจำเป็นลดจาก 🔴 เป็น **🟡** เพราะตัดออกแล้ว P4 ยังใช้งานได้ ·
เก็บ ⭐ ไว้ทั้งคู่ · Teams ยังอยู่ P6 ตามเดิม

วางไว้ท้ายเฟสโดยตั้งใจ — P4 จะกลายเป็นเฟสที่ใหญ่ที่สุด (11 ฟีเจอร์) ของที่อยู่ท้ายสุด
จึงเป็นของที่เลื่อนไป P5 ได้โดยไม่พังอะไร ซึ่งเป็นเหตุผลที่วางตรงนั้น

### Stale detection — ใครเห็น และเห็นที่ไหน (ปิด ❓ 2026-09-02)

`phase-3.md` เขียนแค่ *"เตือนคนที่ควรรู้"* ไม่เคยบอกว่าใคร ตอนนี้ตัดสินแล้ว

- **คนที่ควรรู้ = ทุกคนใน project** ไม่ใช่แค่ admin และไม่ใช่แค่เจ้าของงาน
- **ไม่อยู่บนหน้า `home` ของผู้ใช้** — `home` เป็นหน้าส่วนตัวข้าม org วางตรงนั้นแล้ว
  ฟีเจอร์จะกลายเป็น "งานของฉันที่ค้าง" ซึ่งเตือนคนที่รู้อยู่แล้วว่าตัวเองไม่ได้ขยับงาน
- อยู่ในหน้า **project** เหนือรายการงาน เห็นทั้งแท็บ List และ Board
- **ไม่มีค่าเฉลี่ยและไม่มีการเปรียบเทียบเลย** — ใช้เกณฑ์วันที่ตั้งเองต่อ project แทน
  (ดูหัวข้อถัดไป) · `phase-3.md` ที่เขียนว่าเทียบกับพฤติกรรมจริงของทีม **ต้องเขียนใหม่ทั้งย่อหน้า**
- ไม่มีปัญหาสิทธิ์: สมาชิก project เห็นทุกงานใน project อยู่แล้ว การบอกว่าอันไหนค้าง
  ไม่ได้เปิดข้อมูลใหม่

`design-prompt-4.md` ส่งแก้ให้ Claude Design แล้ว (รอบก่อนผมสั่งให้วางบน `home` ซึ่งผิด)

### Stale detection ใช้เกณฑ์ที่ตั้งเอง ไม่ใช่ค่าเฉลี่ย (2026-09-03)

`phase-3.md` เขียนว่าจุดต่างของฟีเจอร์นี้คือ *"เทียบกับพฤติกรรมจริงของทีมนั้น ไม่ใช่กฎตายตัว"*
**ยกเลิกแนวคิดนั้นทั้งก้อน** เหลือแค่ "งานที่ไม่ขยับเกิน N วัน" โดย N ตั้งเองต่อ project

**เหตุผล — เป็นหลักการที่ docs ตัดสินไว้แล้วสองที่ แค่ไม่เคยเอามาใช้ตรงนี้**

แถบนี้ **ทุกคนใน project เห็น** การมีค่าเฉลี่ยแปลว่าสมาชิกถูกเอาไปเทียบกับมันต่อหน้าคนทั้ง project
ซึ่งเป็นสิ่งเดียวกับที่ปฏิเสธไปแล้วใน:

- `phase-4.md` — *"ไม่ทำ leaderboard รายคน ... leaderboard รายคนทำให้คนประมาณเผื่อ
  แตก task ย่อยๆ ให้นับได้เยอะ หรือเลี่ยงงานที่ estimate น้อยแต่ใช้เวลานาน"*
- `phase-2.md` — คำถาม *"คนนี้ทำอะไรบ้าง"* → **ไม่ทำ**

ค่าเฉลี่ยของ project ก็เป็นตัวเทียบรายคนโดยอ้อม เพราะงานค้างมีชื่อ assignee ติดอยู่ทุกแถว

**ที่ยอมเสีย:** ⭐ บน `03-roadmap.md` P3 แถวที่ 10 ควรถอดหรือเขียนเหตุผลใหม่ — ที่เหลือคือ
"งานไม่ขยับเกิน N วัน" ซึ่งเครื่องมืออื่นมี · ประโยชน์จริงยังอยู่ (งานหลุดเรดาร์โผล่ขึ้นมาเอง)
แต่ไม่ใช่ของที่ลอกยาก

**Schema ที่ตามมา — เพิ่มใน §8**

| ตาราง | เพิ่ม |
| --- | --- |
| `project.projects` | `stale_after_days integer` **nullable = ปิดฟีเจอร์** · ค่าเริ่มต้นที่ UI เสนอคือ 7 |

nullable แทนที่จะเป็น `NOT NULL DEFAULT 7` + boolean แยก เพราะได้คอลัมน์เดียวจบและ
"ไม่มีค่า = ไม่ทำ" อ่านออกจากตัวมันเอง · ทรงเดียวกับ `tasks.sprint_id IS NULL = Backlog`
ไม่ใช่ทรง `estimate_unit = 'none'` ซึ่งใช้ sentinel เพราะเป็น text ที่ต้องมีค่าอยู่แล้ว

ไม่ใส่ CHECK ตาม `02-database/README.md#check-vs-enum` — ไม่มี index ไหนอ่านคอลัมน์นี้

### Activity feed ระดับ project — ไม่เพิ่ม `project_id` ลง `audit.logs` (2026-09-03)

เจอตอนเขียน `phase-3.md`: feed นี้ query ด้วย index ที่มีอยู่ไม่ได้ เพราะ `audit.logs`
เก็บแค่ `entity_type` + `entity_id` แบบ polymorphic ไม่มี `project_id`

**ตัดสิน: ไม่เพิ่มคอลัมน์** ทั้งที่ตอนนี้เพิ่มได้ฟรี (ยังไม่ deploy) — เหตุผลไม่ใช่เรื่องขนาดข้อมูล
แต่เป็นกติกาที่คุมตารางนี้อยู่ ใน docblock ของ `audit.service.ts`:

> _"The only way in and the only way out: **no other module may join `audit.logs`**,
> or nobody will ever be able to change its shape again."_

`project_id` คือการสอนตารางที่ตั้งใจให้ไม่รู้จักโดเมนของใครเลย ให้รู้จักคำว่า project
· ทางที่เลือกแทนเข้ารูปเดิมพอดี — audit รับ **ลิสต์ของ entity id** แล้วคืน log ออกไป
ทรงเดียวกับ `findRecentTargets` ที่คืน id ให้ผู้เรียกตีความเอง

**ครึ่งหนึ่งของ feed ใช้ของที่มีอยู่ได้เลย** — event ระดับบริหาร (เพิ่ม/ถอดคน, แก้ settings)
เก็บเป็น `entity_type='project'` + `entity_id=<project id>` ซึ่ง `findForEntity` เดิมตอบได้ตรงๆ
· ที่ต้องหา task id เพิ่มคือส่วน event ของงานเท่านั้น

**ต้นทุนจริงของคอลัมน์ไม่ใช่ migration แต่คือทุก call site ต้องจำเติมค่าให้ถูกตลอดไป**
คอลัมน์ที่เติมพลาดเงียบๆ แย่กว่าไม่มีคอลัมน์ เพราะ feed จะขาดไปโดยไม่มีใครรู้

ตัว feature ยัง **🟢 P3 ตามเดิม** — คำถามที่คนถามจริง ("ใครแก้ due date") Phase 2 ตอบไปแล้ว
ในหน้า task · feed ตอบคำถามที่ถามน้อยกว่ามาก แต่ราคาถูกลงเยอะแล้วเมื่อไม่ต้องแตะ schema

---

## 14. ขั้น 3 — ตรวจ docs ใหม่กับ design สองรอบสวนทาง (2026-09-03)

design ที่ตรวจ: `Taskflow Prototype.dc.html` etag `1788404845235400` (ไม่เปลี่ยนตั้งแต่รอบก่อน)

### ตัดสินแล้ว 4 ข้อ

| | เดิม | ตัดสิน |
| --- | --- | --- |
| อายุคำเชิญ | docs 7 วัน · design 14 วัน | **14 วัน** — ตัวกันความเสี่ยงจริงคือ "ใช้ได้ครั้งเดียว" + "ต้อง login ด้วยอีเมลนั้น" ไม่ใช่ความสั้นของหน้าต่างเวลา · เผื่อคนลาพักร้อนหนึ่งสัปดาห์ |
| ใครสร้าง project ได้ | docs ไม่เคยพูดถึง | **owner / admin เท่านั้น** ตามตาราง Roles ใน design · เข้าชุดกับกติกาที่ member เห็นเฉพาะ project ที่ตัวเองเป็นสมาชิก — คนที่มองไม่เห็นภาพรวมไม่ใช่คนที่ควรตัดสินว่าต้องมี project ใหม่ |
| ออกจาก org เอง | design มี · docs ไม่มี | **มี · Phase 2 คู่กับ danger zone** — เป็น Remove From Org ที่ตัวเองเป็นคนกด ใช้โค้ดเส้นเดียวกัน · owner คนสุดท้ายออกเองไม่ได้ |
| เตือนตอนถอดคนออกจากทีม | docs เตือน · design ไม่เตือน | **เก็บคำเตือนไว้ · design ต้องแก้** |

**เรื่องคำเตือนตอนถอดคนออกจากทีม** — design เขียนว่า _"Removing someone from a team leaves
their existing task assignments untouched"_ ซึ่งจริงเฉพาะ assignment ที่เป็นรายคน ·
งานที่ assign ให้ทีมเก็บ id ของทีม ไม่ได้กางสมาชิกออกเป็นแถว (design เองก็เขียน
_"assigned to the team, not to you"_) **ถอดคนออกจึงทำให้เขาหลุดจากงานเหล่านั้นจริง** ·
ประโยคใน design จึงชวนให้เข้าใจผิด และหน้าจอไม่มีคำเตือน — ต้องแก้ทั้งสองอย่าง

### แก้เอง 5 จุด (ไม่ต้องถาม)

- ปุ่ม "Create organization" มีจริงในหน้า no-org — `phase-1.md` เคยเขียนว่า "ไม่มีปุ่มสร้าง org"
  · design วาดปุ่มไว้แต่จอที่เปิดออกมาบอกเองว่าถึง Phase 3 สร้างผ่าน API เท่านั้น **การตัดสินเรื่องเฟสไม่เปลี่ยน** แก้แค่ประโยคใน docs
- ลบทีม → งานที่ assign ให้ทีมนั้นกลายเป็นไม่มีผู้รับ ไม่มีใครหลุดจาก org (design มี docs ไม่มี)
- ถอดคนออกจาก project → งานยังอยู่กับเขา แต่เขาเปิด project ไม่ได้ · ต้องเตือนพร้อมจำนวนงาน
  เพราะขัดกับกติกา P1 ที่ assign คนนอกแล้วระบบเพิ่มเข้า project ให้
- การเรียงใน list view ไม่ทำให้ต้นไม้แบน — parent ก่อน แล้วลูกใต้ parent ตัวเอง (design เขียนไว้สองที่)
- filter ทุกข้อเป็น AND ไม่มี OR ระหว่างข้อ · หลายค่าในข้อเดียวใช้ "is in"

### ที่ตรงกันหมด ไม่ต้องแตะ

remember me · reset link 30 นาที · ล็อกบัญชี · ชื่อเล่น · หลาย org + switcher + Home + จอ no-org ·
owner หลายคน · invitations tab ติดป้าย Phase 2 · task key + prefix · status ตั้งต้น 4 อัน
(Cancelled = pink) + หน้าจอแก้ status พร้อมปุ่มลบจางเมื่อมีงานใช้ · quick add เฉพาะหน้า project ·
assignee picker สองชั้น (ไม่มีชั้น "เพิ่ง assign ล่าสุด") · priority 4 ระดับ ·
My Tasks ซ่อน done/cancelled เป็น default · inbox ติดป้าย Phase 3 · archive · danger zone ·
ลบบัญชีตัวเองท้ายหน้า profile · stale bar + setting จำนวนวัน (ไม่มีค่าเฉลี่ยที่ไหนเลย) ·
carry over 3 ตัวเลือกติดป้าย Phase 3 · activity tab ติดป้าย Phase 3 · deactivate ไม่ย้ายงาน ·
แท็บ view ที่ save ได้ = อยู่นอกกรอบ P1-3 ตามที่ `phase-3.md` เขียนไว้

### design แก้แล้ว — ตรวจเมื่อ 2026-09-03 (etag `1788425519274953`)

สองจุดที่ค้างจาก §14 ปิดครบ ในแท็บ Teams ของ org settings

- ประโยคท้ายแท็บเปลี่ยนเป็น _"Tasks assigned to this team follow its membership — remove
  someone and those tasks leave their list. Tasks assigned to them directly are not
  affected."_ ตรงกับที่ docs เขียน · ประโยคของแท็บ Members ระดับ project ไม่ถูกแตะ
  (ของเดิมถูกอยู่แล้ว เพราะสมาชิก project ไม่ได้เป็นตัวกำหนดผู้รับงาน)
- ปุ่ม `×` บนชิปสมาชิกเปลี่ยนเป็น `askRemove` → แถบยืนยันสีแดงทรงเดียวกับตอนลบทีม
  พร้อมจำนวนงานที่กระทบ — _"Remove ชื่อ from ทีม? They lose the N tasks assigned to this
  team. Tasks assigned to them directly stay with them."_ · N นับจากงานที่ถือ id ของทีมนั้น
  ไม่ใช่จากรายคน ซึ่งเป็นการนับที่ตรงกับวิธีเก็บจริง

## 15. ขั้น 4 — แผนโค้ด (2026-09-03)

แผนเต็มอยู่ที่ [`schema-batch.md`](./schema-batch.md) · ที่นี่เก็บเฉพาะ**สิ่งที่ตัดสินใหม่**

| ตัดสิน | ผล |
| --- | --- |
| renumber migration ไหม | **ไม่ต้อง** — รอบนี้ไม่มีไฟล์ใหม่เลย (ตารางใหม่ลงไฟล์ของ schema ตัวเอง) และ `SeedSystemPermissions` ย้ายออกไปเป็น seed พอดี เหตุผลที่จะต้อง renumber จึงหายไปเอง |
| RLS · squash · chat soft delete | เลื่อนตามเฟสของมัน — RLS Phase 2 ไฟล์แยก · เก็บ 12 ไฟล์ไม่ squash เพราะ docblock คือบันทึก · chat Phase 4 ยังไม่สร้างตาราง |
| `notify.notifications` ลงไฟล์ไหน | เปลี่ยนชื่อ `CreateNotifyOutbox` → **`CreateNotify`** (ไฟล์ + คลาส timestamp เดิม) แล้วใส่ทั้งสองตารางในนั้น — หนึ่งไฟล์ต่อหนึ่ง schema เหมือนไฟล์อื่น |
| `priority` เพิ่ม `'urgent'` ยังไง | **ไม่แตะ database** — ไม่มี index หรือ constraint ไหนอ่านค่านี้ ([กติกา CHECK vs enum](../docs/02-database/README.md)) · เพิ่ม `TASK_PRIORITIES` ใน `@repo/shared` ให้ zod กันแทน |
| `automation` ไม่มีใน `CreateSchemas` | เพิ่มเลยในรอบนี้ · schema เปล่าไม่มีต้นทุน และ docblock ของไฟล์เขียนเองว่าสร้างครบตั้งแต่แรก |

**เพิ่ม error code `ORG_NOT_SELECTED`** — เดิมแผน auth มี `NO_ORGANIZATION` ตัวเดียว
พอ multi-org เป็นจริงตั้งแต่ Phase 1 มันต้องตอบสองสถานการณ์ที่ต้องการคนละหน้าจอ:
"อยู่ 3 org แต่ยังไม่ได้เลือก" กับ "ไม่ได้อยู่ org ไหนเลย" · code เดียวจะพาคนที่มีสามบริษัท
ไปหน้า "สร้าง org แรกของคุณ"

**cookie `active_org` ที่ชี้ org ที่ไม่ได้เป็นสมาชิก → 403 แล้ว _ลบ cookie ทิ้ง_**
ไม่ใช่แค่ปฏิเสธ · ตัวเลือกที่ค้างอยู่จะทำให้เขาติดอยู่กับ 403 ทุก request จนกว่าจะล้าง browser

**แผน auth ที่ park ไว้เขียนใหม่แล้ว** (`~/.claude/plans/floofy-stargazing-mochi.md`)
สามจุดที่ผิดหลัง replan: §1 ไม่ใช่การแหก docs อีกแล้ว (docs แก้ตามไปแล้ว) ·
§3 เลิก `501 MULTIPLE_ORGANIZATIONS` เปลี่ยนเป็น cookie + membership ·
§5 คอลัมน์ lockout ย้ายไปอยู่ schema batch ที่ต้องรันก่อน
