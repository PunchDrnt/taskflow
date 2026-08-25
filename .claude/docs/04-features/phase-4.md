# Phase 4 — Custom Fields, Views, Reports, Estimates `v1.3.0`

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

---
