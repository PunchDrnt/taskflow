# Phase 4 — Custom Field, View, รายงาน, Chat `v1.3.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

## Custom Field (Project Level)

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

## Built-in vs Custom Field

ไม่ทำแบบ Notion ที่เกือบทุก property เป็น custom — เพราะระบบต้อง**รู้ความหมาย**ของฟิลด์ ไม่ใช่แค่เก็บค่า

| Built-in (ระบบเข้าใจความหมาย)                               | Custom field                        |
| ---------------------------------------------------------- | ----------------------------------- |
| Title, Status, Assignee, Due date, Priority, Created by/at | "วันที่ตรวจ", "เลขที่เอกสาร", "ลูกค้า" ฯลฯ |

ถ้าทำ status เป็น custom field จะเสีย `is_done_type`, `completion_policy`, `completed_by`, progress ของ sub-task, logic แจ้งเตือนเลย due date และ Kanban ที่รู้ว่าจัดกลุ่มตามอะไร

**แต่หยิบสิ่งที่ Notion ทำดีมาใช้:** built-in กับ custom ต้องดูและใช้งานเหมือนกันหมด — สลับตำแหน่ง ซ่อน filter sort group by ได้เท่ากัน ต่างกันแค่ built-in ลบไม่ได้และเปลี่ยน type ไม่ได้

## View Config

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
  type,              -- 'list' | 'board' | 'calendar'
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

## Reports

- Calendar view
- Dashboard สรุป — งานค้าง, เกินกำหนด, % เสร็จ (นับจาก `is_done_type`)
- Group by / Sort ยืดหยุ่น
- Export Excel / PDF

## Handover Mode

พนักงานลาออก / ลาคลอด / ย้ายแผนก → กดปุ่มเดียวเห็นงานทั้งหมดของคนนั้น

- โอนเป็นชุดให้คนอื่นได้ทีเดียว (เลือกทั้งหมด หรือเลือกทีละงาน)
- สรุปสถานะแต่ละงานให้คนรับ
- บันทึกลง activity log ว่าใครโอนให้ใครเมื่อไหร่
- รองรับทั้ง assign เดี่ยวและงานที่อยู่ในทีม

> ปัญหานี้ทุกบริษัทเจอ แต่เกือบทุกเครื่องมือไม่มีให้ — ต้องไล่ filter เองทีละงาน

ต้องรอ Phase 4 เพราะต้องมี team + permission ครบก่อน

## Estimate + Velocity

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

## Chat Integration — Discord + Line

**อยู่ช่วงหลังของ Phase 4 โดยตั้งใจ** — เดิมอยู่ Phase 2 (Discord) และ Phase 3 (Line)
ย้ายลงมาทั้งคู่เมื่อ 2026-09-02 เพื่อให้แกนหลักถึงมือคนใช้ก่อน · ลดจาก 🔴 เป็น 🟡
เพราะตัดออกแล้ว Phase 4 ยังใช้งานได้ · Teams ยังอยู่ [Phase 6](./phase-6.md) ตามเดิม

> **สิ่งที่แลกไป: ของที่ปล่อยจบ Phase 3 เป็น task tracker มาตรฐาน ยังไม่มีตัวต่าง**
> — เป็นการเลือกส่งแกนหลักให้เสร็จก่อน ไม่ใช่การมองข้าม · P4 เป็นเฟสที่ใหญ่ที่สุด
> ของที่อยู่ท้ายสุดจึงเป็นของที่เลื่อนไป P5 ได้โดยไม่พังอะไร ซึ่งเป็นเหตุผลที่วางตรงนี้

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
├─ DiscordAdapter   Phase 4
├─ LineAdapter      Phase 4 (ต่อจาก Discord)
└─ TeamsAdapter     Phase 6
```

ทุกเจ้ามีสามอย่างเหมือนกัน — รับข้อความเข้า (webhook), ส่งออก, ปุ่มโต้ตอบ ต่างกันแค่ payload

|         | Webhook       | ส่งออก   | ปุ่ม                           | ความยาก |
| ------- | ------------- | ------- | ---------------------------- | ------- |
| Discord | ง่ายมาก        | ง่าย     | button, modal, slash command | ⭐      |
| Line    | ปานกลาง       | ง่าย     | Flex Message + quick reply   | ⭐⭐    |
| Teams   | ยุ่งกับ Azure AD | ปานกลาง | Adaptive Cards               | ⭐⭐⭐  |

Teams ต้องผ่าน Microsoft app approval ซึ่งใช้เวลาและเอกสารเยอะ → รอมีลูกค้าองค์กรขอ

**Schema (สร้างตอน Phase 4 นี้เอง · ดูเต็มใน [`02-database/schema.md`](../02-database/schema.md#schema-chat-phase-4))**

สองตารางนี้เป็นตารางอิสระ ไม่มีตารางอื่นชี้มาหา จึงเป็นข้อยกเว้นเดียวของกติกา "สร้าง schema ครบทุก module ใน Phase 0" — **การเพิ่มตารางใหม่บนฐานข้อมูลที่มีข้อมูลแล้วราคาถูก ที่แพงคือการแก้ตารางเดิม** · schema `chat` ที่ `CreateSchemas` สร้างไว้แล้วปล่อยว่างไว้จนถึงตอนนั้น

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

> ⚠️ **ตอนสร้างตารางนี้ต้องกลับไปแก้ retention job ด้วย** — [anonymize บัญชี](./phase-2.md#delete-account)
> ต้องล้าง `chat.identities` ไปพร้อมกัน เพราะ `external_id` ของ Discord/Line
> เป็นข้อมูลส่วนบุคคลเหมือนกัน · ข้อนี้เขียนไว้ตั้งแต่ตอนที่ chat ยังอยู่ Phase 2
> ต้องทำตอนสร้างตาราง ไม่ใช่ตอนนึกออก

**เคสที่ต้องตัดสินตอนทำจริง**

> ❓ **ยังไม่ตัดสิน** — ตารางนี้เป็นข้อเสนอเบื้องต้น ยังไม่ผูกมัด · ตัดสินตอนลงมือทำ

| เคส                           | แนวทาง                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| คนพิมพ์แต่ยังไม่ link identity     | บอตตอบในห้องพร้อมลิงก์ผูกบัญชี — ผูกครั้งเดียวจบ                                        |
| ห้องยังไม่ผูก project             | บอตถามว่าจะผูกกับ project ไหน (เฉพาะคนที่มีสิทธิ์)                                    |
| link แล้วแต่ไม่ใช่ project member | สร้างได้ แล้วถาม project admin ว่าจะเพิ่มเข้า project ไหม                           |
| Server เดียวผูกหลาย org         | 🔒 **ห้าม** — 1 `external_channel_id` ผูกได้ org เดียว (unique index) กันข้อมูลข้ามบริษัท |

---
