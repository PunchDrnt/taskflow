# Roadmap

จะทำอะไร phase ไหน อันไหนสำคัญก่อน — รายละเอียดของแต่ละ feature อยู่ใน [`04-features.md`](./04-features.md)

> [← Overview](./00-overview.md)

## Contents

1. [Roadmap](#1-roadmap)
2. [Feature List](#2-feature-list) — พร้อม priority 🔴🟡🟢
3. [Build From Day One, Even Without UI](#3-build-from-day-one-even-without-ui)
4. [Cautions](#4-cautions)

---

## 1. Roadmap

| Phase | Version  | เนื้อหา                                                        | ประเมิน   |
| ----- | -------- | ------------------------------------------------------------ | -------- |
| 0     | `v0.1.0` | Foundation — schema ครบ, deploy ได้จริง                        | ~2 สัปดาห์ |
| 1     | `v1.0.0` | **ปล่อยให้คนใช้จริง** — auth, project, task, list, noti          | ~4 สัปดาห์ |
| 2     | `v1.1.0` | Team + Sub-task + Sprint + **Chat (Discord)**                | ~4 สัปดาห์ |
| 3     | `v1.2.0` | Kanban, comment, ไฟล์แนบ, **Chat (Line)**, stale detection    | ~4 สัปดาห์ |
| 4     | `v1.3.0` | Custom field, view config, dashboard, estimate, **handover** | ~4 สัปดาห์ |
| 5     | `v2.0.0` | Advanced features + semantic search                          | —        |
| 6     | `v2.1.0` | ขัดเงา                                                        | —        |

**Phase 7-8 (SaaS, billing, AI ที่ใช้ LLM)** → ดู [`05-saas-notes.md`](./05-saas-notes.md)
ยังไม่ commit — ทำก็ต่อเมื่อ Phase 1-6 มีคนใช้จริงต่อเนื่องแล้วเท่านั้น

**กติกาเลข version**

- `v1.0.0` = รุ่นแรกที่มีคนใช้จริง (ไม่ใช่ Phase 0)
- `v2.0.0` ขึ้น major เพราะเปลี่ยนลักษณะของ product (ฟีเจอร์ขั้นสูง)
- Patch (`v1.0.1`, `v1.0.2`) ใช้กับ bugfix ระหว่าง phase
- Minor ระหว่างทางได้ ถ้าปล่อยฟีเจอร์ย่อยก่อนจบ phase (เช่น `v1.1.0` → `v1.2.0` แม้ Phase 3 ยังไม่จบ)

**เป้าหมายสำคัญที่สุด: มีคนในบริษัทใช้จริงภายใน 6 สัปดาห์**

ของที่ปล่อยแล้วมีคนใช้จริง จะสอนสิ่งที่ spec สอนไม่ได้

---

## 2. Feature List

⭐ = ฟีเจอร์ดาวเด่นที่เป็นจุดต่างจากเจ้าอื่น

**ระดับความจำเป็น**

|     | ความหมาย                                    |
| --- | ------------------------------------------- |
| 🔴  | **ต้องมี** — ตัดแล้ว phase นั้นใช้งานไม่ได้          |
| 🟡  | **ควรมี** — ตัดได้ถ้าเวลาไม่พอ เลื่อนไป phase ถัดไป |
| 🟢  | **ดีถ้ามี** — เลื่อนได้สบาย                       |

ลำดับในตารางคือลำดับที่ควรทำ (บางอย่างบังคับอยู่แล้ว เช่น ต้องมี Project ก่อนถึงมี Status ก่อนถึงมี Task)

> ⚠️ อย่าให้ 🟡 กลายเป็นข้ออ้างตัดทิ้งหมดจนเหลือระบบที่ใช้ได้แต่ไม่มีใครอยากใช้ — **Quick add** กับ **Assignee picker** คือสองอย่างที่ทำให้คนกลับมาใช้ ถ้าตัดทั้งคู่ต้องรู้ตัวว่ากำลังเสี่ยงอะไร

### Features by Phase

<details open>
<summary><b>Phase 0 <code>v0.1.0</code> — Foundation</b></summary>

| #   |     | Feature                                                                           | ใช้ทำอะไร                                                                                                            |
| --- | --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴  | Monorepo + Docker                                                                 | วางพื้นฐานโครงสร้างโปรเจกต์                                                                                             |
| 2   | 🔴  | Base entity                                                                       | UUID, `org_id`, soft delete, audit fields (`created_by/at`, `updated_by/at`, `deleted_by/at`) · `timestamptz` ทั้งหมด |
| 3   | 🔴  | Schema ครบทุก module                                                               | สร้างตารางทั้งหมดไว้ก่อน เพิ่ม feature ทีหลังไม่ต้อง migrate ตารางใหญ่                                                          |
| 4   | 🔴  | `org_id` scoping (repository base class) + test                                   | บังคับกรองข้อมูลตามองค์กร · **RLS เลื่อนไป Phase 2** — เพิ่มทีหลังได้โดยไม่ต้อง migrate                                           |
| 5   | 🔴  | Permission layer (org)                                                            | ที่เดียวที่ตัดสินว่าใครทำอะไรได้ ไม่กระจายในทุก controller                                                                     |
| 6   | 🔴  | Activity log (เขียนใน tx เดียวกับ business logic) + event emitter สำหรับ notification | บันทึกทุกการเปลี่ยนแปลง — ข้อมูลย้อนหลังสร้างใหม่ไม่ได้ จึงห้ามพึ่ง event ที่อยู่นอก transaction                                         |
| 7   | 🔴  | Deploy ขึ้น Bangmod ได้จริง                                                           | pipeline ที่ทำทีหลังมักกลายเป็นคอขวด                                                                                      |
| 8   | 🔴  | `EmailService` + outbox                                                           | ห่อ Resend · Phase 1 ต้องใช้ทันที                                                                                        |
| 9   | 🟡  | `StorageService`                                                                  | ห่อ Garage (S3) — Phase 1 ใช้แค่รูปโปรไฟล์ ไฟล์แนบจริงมา Phase 3                                                                 |
| 10  | 🟡  | `FeatureService.isEnabled()`                                                            | Phase 1 ใช้ดัก `public_registration`                                                                                  |
| 11  | 🟡  | CI/CD                                                                             | build นอกเครื่อง production                                                                                           |
| 12  | 🟡  | Sentry                                                                            | รู้บั๊กก่อนคนบ่น                                                                                                          |
| 13  | 🟢  | Seed script                                                                       | ข้อมูลตัวอย่างสำหรับ dev/demo                                                                                            |
| 14  | 🟢  | ตาราง RBAC ระดับระบบ                                                               | สร้างไว้เฉยๆ ไม่มีโค้ดอ่าน — back-office มา Phase 7                                                                       |

**รายละเอียด** → [Phase 0 ใน `04-features.md`](./04-features.md#phase-0--foundation-v010)

</details>

<details open>
<summary><b>Phase 1 <code>v1.0.0</code> — ปล่อยให้คนใช้จริง</b></summary>

| #   |     | Feature                        | ใช้ทำอะไร                                                                           |
| --- | --- | ------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | 🔴  | Auth + session                 | login/logout · JWT + refresh rotation · เช็ค session ทุก request (deactivate มีผลทันที) |
| 2   | 🔴  | โปรไฟล์ + ชื่อเล่น                 | ชื่อ อีเมล รูป · **ชื่อเล่น** เพราะคนไทยเรียกชื่อเล่น ค้นด้วยชื่อจริงอย่างเดียวหาไม่เจอ               |
| 3   | 🔴  | Organization + owner หลายคน    | ชั้นบนสุดที่ครอบทุกอย่าง · ไม่ให้ org ค้างเพราะ owner คนเดียวหายไป                            |
| 4   | 🔴  | Project + member               | จัดกลุ่มงาน · เข้าร่วมได้โดยไม่ต้องอยู่ทีมเดียวกัน                                              |
| 5   | 🔴  | Custom status + `is_done_type` | แต่ละ project กำหนดขั้นตอนเองได้ · บอกระบบว่าอันไหนนับเป็นเสร็จ                             |
| 6   | 🔴  | Task CRUD                      | บันทึกงาน — แกนหลักของระบบ                                                            |
| 7   | 🔴  | Assign หลายคน                  | งานที่ต้องมีหลายคนรับผิดชอบ                                                              |
| 8   | 🔴  | List view + filter + search    | ดูงานทั้งหมดและกรองตามที่ต้องการ                                                         |
| 9   | 🔴  | My Tasks                       | หน้าที่คนเปิดบ่อยที่สุด — งานของฉันอยู่ตรงไหน                                                 |
| 10  | 🔴  | Email noti เมื่อถูก assign        | ถ้าไม่มีแจ้งเตือน คนไม่รู้ว่ามีงานมา แล้วจะไม่กลับเข้าระบบ                                       |
| 11  | 🟡  | **Quick add**                  | พิมพ์ชื่องาน + Enter จบ ลดแรงเสียดทานตอนสร้าง (สาเหตุหลักที่ระบบ task ตาย)                   |
| 12  | 🟡  | **Assignee picker ฉลาด**       | บริษัท 100 คนไม่ต้องเลื่อนหารายชื่อ — เรียงคนที่น่าจะเลือกขึ้นก่อน                                 |
| 13  | 🟡  | ลืม/เปลี่ยนรหัสผ่าน                 | reset ผ่านลิงก์อีเมลอายุ 10 นาที · เปลี่ยนต้องใส่รหัสเดิม                                      |
| 14  | 🟡  | `is_cancelled_type`            | แยก "ยกเลิก" ออกจาก "เสร็จ" — ตัดออกจากตัวหารของ progress และ velocity                 |
| 15  | 🟡  | Deactivate user                | พนักงานลาออกแต่ประวัติงานยังอยู่ ไม่ต้องลบทิ้ง                                                |
| 16  | 🟢  | Filter งานของคน inactive       | กันงานค้างอยู่กับคนที่เข้าระบบไม่ได้แล้วโดยไม่มีใครเห็น                                          |

> 11-12 เป็น 🟡 แต่**ตัดทั้งคู่ไม่ได้** — สองอย่างนี้คือสิ่งที่ทำให้คนกลับมาใช้ ถ้าเวลาไม่พอจริงๆ เลือกตัดอย่างใดอย่างหนึ่ง

**รายละเอียด** → [Phase 1 ใน `04-features.md`](./04-features.md#phase-1--first-real-users-v100)

ข้อ 1, 2, 13 → [Auth & Users](./04-features.md#auth--users) · ข้อ 3 → [Organization](./04-features.md#organization) · ข้อ 4 → [Project](./04-features.md#project) · ข้อ 5, 14 → [Status](./04-features.md#status-custom-per-project) · ข้อ 6, 7, 11, 12 → [Task](./04-features.md#task) · ข้อ 8, 9, 16 → [Views](./04-features.md#views) · ข้อ 10 → [Notifications](./04-features.md#notifications) · ข้อ 15 → [User States](./04-features.md#user-states--three-different-things)

</details>

<details open>
<summary><b>Phase 2 <code>v1.1.0</code> — Team + Sub-task + Sprint + Chat</b></summary>

| #   |     | Feature                   | ใช้ทำอะไร                                                                |
| --- | --- | ------------------------- | ----------------------------------------------------------------------- |
| 1   | 🔴  | Team + role               | จัดกลุ่มคนตามโครงสร้างองค์กร ใช้ assign และดูภาพรวม                            |
| 2   | 🔴  | Assign ให้ทีม               | PM มอบงานให้ทีมโดยไม่ต้องระบุคน ให้ทีมจัดการกันเอง                               |
| 3   | 🔴  | Sub-task                  | แตกงานใหญ่เป็นงานย่อย แต่ละอันมีเจ้าของและสถานะของตัวเอง                        |
| 4   | 🔴  | Task Progress             | ดูความคืบหน้างานหลักโดยไม่ต้องเปิดดูทีละ sub-task — `done / (total − cancelled)` |
| 5   | 🔴  | **Chat — Discord** ⭐     | สร้าง/ปิดงานจากในแชทโดยไม่ต้องเปิดเว็บ — ไปหาคนที่ที่เขาอยู่จริง                     |
| 6   | 🟡  | Sprint + `sprint_enabled` | ทำงานเป็นรอบ · ทีมที่ไม่ใช้ไม่ต้องเห็นฟิลด์ที่ไม่เกี่ยว                                 |
| 7   | 🟡  | ปิด sprint                 | จบรอบแล้วเริ่มรอบใหม่ — งานค้างตกไป backlog (จำเป็นถ้าทำข้อ 6)                  |
| 8   | 🟡  | `completion_policy`       | แต่ละ project เลือกได้ว่าใครมีสิทธิ์กดปิดงาน                                     |
| 9   | 🟡  | แยก sub-task ออก          | งานย่อยที่โตขึ้นแยกเป็นงานหลักได้ โดยไม่เสีย comment/ประวัติ                        |
| 10  | 🟡  | Remove จาก org            | เอาคนออกจาก org โดยที่ account เขายังใช้กับที่อื่นได้                             |
| 11  | 🟢  | ลบ account + anonymize    | ลบข้อมูลส่วนบุคคลตาม PDPA โดยไม่ทำให้ประวัติงานพัง (กู้คืนได้ใน 30 วัน)               |
| 12  | 🟡  | **Activity log ในหน้า task** | "ใครแก้ due date" "ใครย้ายไป Done" — คำถามที่มาทันทีที่หลายคนแตะงานเดียวกันได้ |

> ข้อ 5 เป็น 🔴 ทั้งที่ดูเหมือนของเสริม — เพราะเป็นจุดขายหลักและตัวเปลี่ยนพฤติกรรมคนใช้ ถ้าเลื่อนออกไปเรื่อยๆ จะไม่ได้ทำเลย
>
> ข้อ 12 เลื่อนขึ้นมาจาก Phase 3 — ข้อ 1, 2 และ 8 รวมกันทำให้หลายคนแตะงานเดียวกันได้เป็นครั้งแรก คำถามว่า "ใครแก้" จึงมาถึงใน phase นี้ ไม่ใช่ phase หน้า · ต้นทุนต่ำเพราะข้อมูลครบตั้งแต่ Phase 0 แค่ query + render (feed ระดับ project กับ filter ยังอยู่ Phase 3)

**รายละเอียด** → [Phase 2 ใน `04-features.md`](./04-features.md#phase-2--team--sub-task--sprint--chat-v110)

ข้อ 1 → [Team](./04-features.md#team) · ข้อ 2, 8 → [Assigning to a Whole Team](./04-features.md#assigning-to-a-whole-team) · ข้อ 3, 4, 9 → [Sub-task](./04-features.md#sub-task) · ข้อ 5 → [Chat — Discord](./04-features.md#chat-integration--discord) · ข้อ 6, 7 → [Sprint](./04-features.md#sprint-basics) · ข้อ 10 → [Remove From Org](./04-features.md#remove-from-org) · ข้อ 11 → [Delete Account](./04-features.md#delete-account) · ข้อ 12 → [Activity Log บนหน้า Task](./04-features.md#activity-log-บนหน้า-task)

</details>

<details open>
<summary><b>Phase 3 <code>v1.2.0</code> — ทำงานร่วมกัน</b></summary>

| #   |     | Feature                   | ใช้ทำอะไร                                                  |
| --- | --- | ------------------------- | --------------------------------------------------------- |
| 1   | 🔴  | Kanban board              | ลากงานเปลี่ยนสถานะ เห็นภาพรวมทั้ง flow ในหน้าเดียว               |
| 2   | 🔴  | Comment + thread          | คุยงานในระบบ ไม่ต้องออกไปแชทแล้วหาไม่เจอทีหลัง                   |
| 3   | 🔴  | **Chat — Line** ⭐        | ตลาดจริงของไทย ตามหลัง Discord บนโครงเดียวกัน                 |
| 4   | 🟡  | ไฟล์แนบ                    | เก็บไฟล์ที่เกี่ยวกับงานไว้ด้วยกัน                                   |
| 5   | 🟡  | แจ้งเตือนครบชุด              | ใกล้ deadline, ถูก mention, comment ใหม่, สถานะเปลี่ยน         |
| 6   | 🟡  | Sprint board + carry over | Kanban ที่กรองด้วย sprint · ปิด sprint แล้วเลือกว่างานค้างจะไปไหน |
| 7   | 🟡  | Table view                | ดูงานเยอะๆ แบบ spreadsheet แก้ค่าในตารางได้เลย                |
| 8   | 🟡  | Tag / Label               | จัดหมวดข้ามโปรเจกต์ เช่น "ด่วน" "รอลูกค้า"                       |
| 9   | 🟢  | Activity log — feed + filter | ไล่ประวัติทั้ง project ไม่ใช่ทีละงาน · กรองตามคน/ชนิด/ช่วงเวลา (หน้า task มาแล้ว Phase 2) |
| 10  | 🟢  | **Stale detection** ⭐    | จับงานที่ค้างผิดปกติก่อนถึง deadline โดยเทียบกับพฤติกรรมจริงของทีม     |

**รายละเอียด** → [Phase 3 ใน `04-features.md`](./04-features.md#phase-3--collaboration-v120)

ข้อ 10 → [Stale Detection](./04-features.md#stale-detection) · ที่เหลืออยู่ในลิสต์รวมของ Phase 3

</details>

<details open>
<summary><b>Phase 4 <code>v1.3.0</code> — Custom field, View, รายงาน</b></summary>

| #   |     | Feature                        | ใช้ทำอะไร                                                                 |
| --- | --- | ------------------------------ | ------------------------------------------------------------------------ |
| 1   | 🔴  | Custom field                   | เพิ่มฟิลด์เองตามงานแต่ละแผนก เช่น "วันที่ตรวจ" "เลขที่เอกสาร"                       |
| 2   | 🔴  | View config                    | สลับ/ซ่อนคอลัมน์ตามที่แต่ละคนอยากเห็น (custom field ที่แสดงไม่ได้ก็ไม่มีประโยชน์)        |
| 3   | 🟡  | Dashboard                      | หัวหน้าดูภาพรวม — งานค้าง เกินกำหนด % เสร็จ                                    |
| 4   | 🟡  | **Handover mode** ⭐           | คนลาออก/ย้ายแผนก โอนงานทั้งชุดทีเดียว ไม่ต้องไล่ทีละงาน                            |
| 5   | 🟡  | Calendar view                  | ดู deadline ทั้งหมดบนปฏิทิน                                                   |
| 6   | 🟡  | Group by / Sort                | จัดกลุ่มตามคน/สถานะ/ทีม ได้อิสระ                                               |
| 7   | 🟢  | View ส่วนตัว                     | ตั้งมุมมองของตัวเองโดยไม่กระทบคนอื่นใน project                                  |
| 8   | 🟢  | Export Excel/PDF               | เอาข้อมูลออกไปทำรายงานหรือส่งให้คนนอกระบบ                                     |
| 9   | 🟢  | Estimate + Velocity + Burndown | ประมาณขนาดงานเพื่อรู้ว่า sprint รับไหวไหม (`estimate_unit` = none เป็น default) |

**รายละเอียด** → [Phase 4 ใน `04-features.md`](./04-features.md#phase-4--custom-fields-views-reports-estimates-v130)

ข้อ 1 → [Custom Field](./04-features.md#custom-field-project-level) · ข้อ 2, 7 → [View Config](./04-features.md#view-config) · ข้อ 3, 5, 6, 8 → [Reports](./04-features.md#reports) · ข้อ 4 → [Handover Mode](./04-features.md#handover-mode) · ข้อ 9 → [Estimate + Velocity](./04-features.md#estimate--velocity)

</details>

<details open>
<summary><b>Phase 5 <code>v2.0.0</code> — Advanced features + Semantic search</b></summary>

| #   |     | Feature                            | ใช้ทำอะไร                                                      |
| --- | --- | ---------------------------------- | ------------------------------------------------------------- |
| 1   | 🟡  | Rich text `/` command              | เขียน description ที่มีรูปแบบ ตาราง checklist                      |
| 2   | 🟡  | Template                           | สร้าง project ใหม่จากแบบสำเร็จรูป ไม่ต้องตั้งค่าซ้ำ                     |
| 3   | 🟡  | Recurring task                     | งานประจำที่เกิดซ้ำ เช่น รายงานทุกวันจันทร์                             |
| 4   | 🟢  | **Semantic search + ตรวจงานซ้ำ** ⭐ | ค้นด้วยความหมาย ไม่ต้องตรงคำ — embedding อย่างเดียว ไม่ต้องมี LLM      |
| 5   | 🟢  | Nested page (3 ชั้น)                 | แตกงานลึกกว่า 2 ชั้น (Epic → Story → Task) — ปลด `MAX_TASK_DEPTH` |
| 6   | 🟢  | Timeline / Gantt                   | ดูงานเรียงตามเวลาและความต่อเนื่อง                                  |
| 7   | 🟢  | Time tracking                      | บันทึกชั่วโมงที่ใช้จริง มักใช้กับงานคิดเงินลูกค้า                            |
| 8   | 🟢  | `all_assignees`                    | บังคับให้ทุกคนที่ถูก assign กดเสร็จ                                   |
| 9   | 🟢  | **Task dependency**                | "งาน A เลื่อน → B, C ที่รออยู่กระทบ" · ทำให้ Gantt (ข้อ 6) มีความหมายจริง |
| 10  | 🟢  | **Automation**                     | สิ่งเดียวที่ทำให้ระบบ _ทำงานแทนคน_ ไม่ใช่แค่บันทึกสิ่งที่คนทำ                  |

> Phase 5 ไม่มี 🔴 เลย — ทั้ง phase เป็นของเสริม ให้เรียงตามสัญญาณจากผู้ใช้จริง ไม่ต้องทำตามลำดับนี้
>
> ข้อ 9 ทำคู่กับข้อ 6 คุ้มกว่าแยกทำ — Gantt ที่ไม่มี dependency คือแผนภูมิแท่งเฉยๆ · ข้อ 10 ต้องรอ custom field กับ status จาก Phase 4 ก่อน ไม่งั้นตั้งเงื่อนไขได้ไม่กี่แบบ

**รายละเอียด** → [Phase 5 ใน `04-features.md`](./04-features.md#phase-5--advanced-features--semantic-search-v200)

ข้อ 4 → [Semantic Search](./04-features.md#semantic-search--duplicate-detection) · ข้อ 9 → [Task Dependency](./04-features.md#task-dependency) · ข้อ 10 → [Automation](./04-features.md#automation) · ที่เหลืออยู่ในลิสต์รวมของ Phase 5

</details>

<details open>
<summary><b>Phase 6 <code>v2.1.0</code> — ขัดเงา</b></summary>

| #   |     | Feature                    | ใช้ทำอะไร                                                         |
| --- | --- | -------------------------- | ---------------------------------------------------------------- |
| 1   | 🟡  | Mobile / PWA               | ใช้งานบนมือถือได้เต็มรูปแบบ                                            |
| 2   | 🟡  | Global search              | ค้นข้ามทุก project ทุกประเภทข้อมูล                                     |
| 3   | 🟡  | Performance tuning         | —                                                                |
| 4   | 🟢  | Light mode                 | แอปเป็นดาร์กธีมเดียวตั้งแต่ Phase 0 · เพิ่มโหมดสว่างไม่ใช่แค่สลับ mapping — ต้องเลือกขั้นสีของ text ใหม่ทุก component เพราะ `-light` อ่านได้บนพื้นมืดและหายไปบนพื้นขาว |
| 5   | 🟢  | **Chat — Microsoft Teams** | Chat adapter ตัวที่สาม (ต้องผ่าน Microsoft app approval ใช้เวลานาน)    |
| 6   | 🟢  | Integration อื่น             | Google Calendar, webhook ทั่วไป                                    |
| 7   | 🟢  | Real-time collaboration    | เห็นการแก้ไขของคนอื่นทันที                                             |

**รายละเอียด** → [Phase 6 ใน `04-features.md`](./04-features.md#phase-6--polish-v210)

</details>

> **Phase 7-8 (SaaS, billing, AI ที่ใช้ LLM)** อยู่ที่ [`05-saas-notes.md`](./05-saas-notes.md) — ยังไม่ commit

### Notes on Prioritisation

**Phase 0-4 คือแกนที่ต้องมี** — ไม่มีอันไหนตัดได้โดยที่ระบบยังใช้งานได้จริง

**Phase 5-6 เป็นแผน แต่ลำดับภายในยืดหยุ่นได้** — พอถึงตอนนั้นจะรู้แล้วว่าคนใช้อะไรจริง ให้เรียงตามสัญญาณจากผู้ใช้ ไม่ต้องทำตามลำดับในเอกสาร

ตัวอย่างสัญญาณที่ควรใช้ตัดสิน:

| Feature          | สัญญาณที่บอกว่าควรทำก่อน            |
| ---------------- | ------------------------------ |
| Light mode       | มีคนขอ (ไม่ใช่งานถูก — ดูตาราง Phase 6) |
| Mobile / PWA     | analytics ชี้ว่ามีคนเปิดบนมือถือเยอะ  |
| Nested 3 ชั้น      | คนชนเพดาน 2 ชั้นบ่อย              |
| Recurring task   | มีคนถามเกิน 3 ทีม                 |
| Time tracking    | มีทีมที่ต้องคิดเงินลูกค้าตามชั่วโมง       |
| Semantic search  | task เกิน 10,000 แล้วเริ่มหาไม่เจอ  |
| Real-time collab | คนบ่นว่าแก้ทับกัน                   |
| Microsoft Teams  | ลูกค้าองค์กรขอ                    |

### ยังไม่อยู่ phase ไหน — รอเงื่อนไข

ต่างจากตารางข้างบนตรงที่ข้างบนคือ "ทำก่อนหรือหลัง" ส่วนตรงนี้คือ **"ยังไม่ตัดสินว่าจะทำ"** · อย่าเผลอหยิบเข้า sprint เพราะเห็นว่าว่าง

| Feature | เงื่อนไขที่จะทำ |
| --- | --- |
| **Import จาก Excel/CSV** | เริ่มมีคนนอกบริษัท/ลูกค้าใช้ — ตอนนี้ทีมจดกันในแชท ไม่มีอะไรให้ import · Export อยู่ Phase 4 ข้อ 8 แล้วและ**ง่ายกว่ากันหลายเท่า** ([ทำไม](./04-features.md#import-จาก-excelcsv)) |

**สิ่งที่ยังไม่ commit เลย** — SaaS, billing, AI ที่ใช้ LLM และ**แบบตรวจ (Inspection)** → [`05-saas-notes.md`](./05-saas-notes.md)

---

## 3. Build From Day One, Even Without UI

เพราะ**แก้ทีหลังต้องรื้อ schema**

- `org_id` scoping ผ่าน Guard/Interceptor ระดับ global (RLS ตามมาใน Phase 2)
- `parent_task_id` + `depth`
- `sprints` table + `tasks.sprint_id` (nullable — ไม่บังคับใช้)
- `FeatureService.isEnabled(org, feature)` — allow-list ว่าง ปิดทุกอย่างเป็น default (เผื่อ SaaS ดู [`05-saas-notes.md`](./05-saas-notes.md))
- `tasks.estimate` + `projects.estimate_unit` (UI เปิด Phase 4)
- `parent_comment_id` เผื่อ comment thread
- comments / attachments แบบ polymorphic (`entity_type`, `entity_id`)
- `tasks.custom_fields` (jsonb) + `field_definitions`
- `views` + `view_columns`
- **Activity log เก็บทุก create/update/delete** — ข้อมูลย้อนหลังสร้างใหม่ไม่ได้ ถ้าเริ่มเก็บตอน Phase 4 ประวัติปีแรกหายเลย · เขียนใน transaction เดียวกับ business logic ไม่ใช่ผ่าน event emitter
- Base entity ครบทุกตาราง — `created_at/by`, `updated_at/by`, `deleted_at/by` เติมอัตโนมัติผ่าน TypeORM subscriber
- Soft delete ทุกตาราง (`deleted_at`) ผ่าน `@DeleteDateColumn` + unique constraint ต้องเป็น partial index
- `audit.logs` partition รายเดือน + `PRIMARY KEY (id, occurred_at)` — ทำทีหลังต้องย้ายข้อมูลทั้งตาราง
- วันเวลาใช้ `timestamptz` ทั้งหมด เก็บ UTC — เปลี่ยนทีหลังต้อง migrate ทุกตาราง
- UUID เป็น primary key
- `sort_order` แบบ fractional-indexing + `COLLATE "C"` (ไม่ใช่ integer เรียงติดกัน — ตอน drag & drop จะได้ไม่ต้อง update ทุกแถว)
- ชั้น permission รวมศูนย์ `can(user, action, resource)` (CASL)
- Role เก็บเป็น string ตรวจที่ application ไม่ใช่ enum ใน DB — เพิ่ม role ใหม่ทีหลังไม่ต้อง migrate
- `StorageService` พูด S3 ตรงๆ ผ่าน AWS SDK — ย้ายจาก Garage ไป S3 หรือ R2 แก้แค่ env
- `EmailService` ห่อ Resend + outbox pattern — เปลี่ยน provider แก้จุดเดียว
- `users.status` เป็น string ('active' | 'deactivated' | 'pending_deletion' | 'deleted') + partial unique index บนอีเมล
- `statuses.is_cancelled_type` — แยก "ยกเลิก" ออกจาก "เสร็จ" ตั้งแต่แรก ไม่งั้น progress กับ velocity จะเพี้ยนย้อนหลังแก้ไม่ได้
- `chat.identities` + `chat_channels` (สร้างตอน Phase 2 — ตารางอิสระ ไม่ต้องเผื่อใน Phase 0)
- List view รับ config คอลัมน์เป็น array ไม่ hard-code ใน JSX

**อย่า over-engineer จนไม่ได้ปล่อยของ** — ยังไม่ต้องทำ microservices, event sourcing, real-time infra, DDD 4 ชั้น

---

## 4. Cautions

### Object storage

- แยก volume ของ Garage ออกจาก DB และ backup แยกกัน — ไฟล์หายกู้จาก DB ไม่ได้
- Bucket เป็น private เข้าถึงผ่าน **presigned URL** เท่านั้น
- `garage-ui` ถือ admin token — ผูก `127.0.0.1` เท่านั้น และไม่ขึ้นบน server (อยู่ใน `docker-compose.yml` ไม่ใช่ `deploy/compose.yml`)

### Minimum Tests

ไม่ต้องคลุมทั้งระบบ แต่สองอย่างนี้ต้องมี เพราะพลาดแล้วข้อมูลรั่ว:

- `org_id` scoping — query จาก org A ต้องไม่เห็นข้อมูล org B
- Permission layer — แต่ละ role ทำอะไรได้/ไม่ได้

### Real-World Adoption

- ระบบ task ภายในบริษัทมักตายเพราะ**คนไม่เข้ามาอัปเดต** ไม่ใช่เพราะฟีเจอร์ไม่พอ
- ตัวแปรสำคัญคือแรงเสียดทานตอนสร้าง task → จึงต้องมี quick add
- ทีมคุ้นกับความง่ายของ chat อยู่แล้ว ระบบต้องไม่ยากกว่านั้นมาก
- Assign ให้ทีมอาจใช้น้อยกว่าที่คิด — คนมักอยากรู้ว่า "ใครรับผิดชอบ" มากกว่า "ทีมไหน" ให้สังเกตหลังปล่อยจริง ถ้าใช้น้อยอย่าลงทุนต่อ
- **ความเสี่ยงที่ใหญ่ที่สุดไม่ใช่เรื่องเทคนิค** — ระบบภายในมักตายเพราะคนทำเบื่อหรือย้ายงาน spec นี้รองรับ 5 ปีได้ แต่คำถามคือจะมีคนดูแลถึงปีที่ 2 ไหม ยิ่งเป็นเหตุผลให้ปล่อยเร็วและเรียบง่าย

### PDPA

- ระบบเก็บชื่อ อีเมล รูปพนักงาน = ข้อมูลส่วนบุคคล
- Bangmod อยู่ในไทย → ไม่มีปัญหาการโอนข้อมูลข้ามแดน
- ถ้าจะขายเป็น SaaS ให้บริษัทอื่น ลูกค้าองค์กรจะถามเรื่องนี้แน่นอน
