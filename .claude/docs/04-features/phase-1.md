# Phase 1 — First Real Users `v1.0.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

## Auth & Users

- Login / Logout (JWT + refresh token rotation — ดูรายละเอียดใน [`01-architecture.md`](../01-architecture.md#auth))
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

## Organization

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

## User States — Three Different Things

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

## Project

- สร้าง / แก้ไข / ลบ project
- Project member เข้าได้อิสระ ไม่ผูกกับทีม (แบบ Slack channel)

## Status (Custom Per Project)

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

[ดู schema เต็ม](../02-database/schema.md#schema-project)

## Task

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

## Notifications

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

## Views

- **List view** — รับ config คอลัมน์เป็น array จากที่เดียว (hard-code ไว้ก่อนได้) ไม่เขียน `<th>` ตายตัวใน JSX เพื่อให้ต่อ `view_columns` ใน Phase 4 ได้โดยแก้จุดเดียว
- Filter: คน, status, priority, วันที่, **งานของคนที่ inactive** (กันงานค้างโดยไม่มีใครเห็น)
- Search พื้นฐาน
- **My Tasks** — Phase 1 มีแค่งานที่ assign ให้ตัวเอง (ยังไม่มีทีม)

---
