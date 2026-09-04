# Taskflow — Overview

> ระบบบันทึกและติดตามงานภายในบริษัท ออกแบบเผื่อขยายเป็น SaaS ในอนาคต

จุดเริ่มต้นของเอกสารทั้งชุด — อ่านไฟล์นี้ก่อนไฟล์อื่นเสมอ

## Contents

1. [How to Read These Docs](#how-to-read-these-docs) — binding / guideline / open · [หนึ่งเรื่อง หนึ่งบ้าน](#หนึ่งเรื่อง-หนึ่งบ้าน)
2. [Where to Find Things](#where-to-find-things)
3. [Where to Start](#where-to-start)
4. [The Problem](#the-problem)
5. [Who Uses It, Who Builds It](#who-uses-it-who-builds-it)
6. [Glossary](#glossary)
7. [Decision Principles](#decision-principles)
8. [Binding Decisions](#binding-decisions) ← สิ่งที่ห้ามเปลี่ยนเงียบๆ
9. [What's in Each File](#whats-in-each-file)

---

## How to Read These Docs

**เอกสารชุดนี้เป็น guideline โดยปริยาย ไม่ใช่คำสั่ง** — เจอเหตุผลที่ดีกว่าก็เปลี่ยนได้ แต่ต้องบอก

ยกเว้นรายการเล็กๆ ที่ทำเครื่องหมายไว้ ซึ่งเปลี่ยนแล้วเสียหายถาวร

| เครื่องหมาย        | ความหมาย                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| 🔒 **ต้องทำ**     | เบี่ยงเบนแล้วต้อง migrate ทั้งตาราง / ข้อมูลรั่วข้าม org / ประวัติหายแบบสร้างใหม่ไม่ได้ — ดู [Binding Decisions](#binding-decisions) |
| _(ไม่มีเครื่องหมาย)_ | **แนวทาง** — ค่าเริ่มต้นของทุกหัวข้อ · เปลี่ยนได้ถ้ามีเหตุผล ขอแค่บอกว่าเปลี่ยน                                                     |
| ❓ **ยังไม่ตัดสิน**  | ตั้งใจเว้นไว้ · ตัดสินตอนมีโค้ดจริงอยู่ตรงหน้า                                                                                 |

**ตั้งใจ mark เฉพาะกลุ่ม 🔒** — ถ้า mark ทุกหัวข้อจะกลายเป็น noise แล้วไม่มีใครอ่าน

### เวลาทำจริงต่างจากเอกสาร

| กรณี          | ต้องทำอะไร                                           |
| ------------ | --------------------------------------------------- |
| ต่างจาก 🔒    | แก้เอกสารในการเปลี่ยนแปลงเดียวกัน **และพูดออกมา** ห้ามเงียบ |
| ต่างจากแนวทาง | บอกว่าเบี่ยง · ถ้าเป็นการเปลี่ยนถาวรค่อยแก้เอกสารตาม         |
| ❓ ยังไม่ตัดสิน  | ตัดสินได้เลย แล้วบันทึกลงเอกสารเมื่อตัดสินแล้ว                 |

> เอกสารที่ไม่ตรงกับโค้ดจริงอันตรายกว่าไม่มีเอกสาร เพราะคนจะเชื่อมันแล้วตัดสินใจผิด

### หนึ่งเรื่อง หนึ่งบ้าน

**ข้อเท็จจริงหนึ่งอย่างเขียนเต็มได้ที่เดียว · ที่อื่นลิงก์ไป ห้ามเล่าซ้ำ**

ไม่ใช่เรื่องความเรียบร้อย — ตอนแก้กฎ `org_id` ครั้งเดียวต้องตามแก้ 4 ไฟล์ เพราะเหตุผลของมันถูกเล่าไว้ทั้ง 4 ที่ · เล่าซ้ำ N ที่ = แก้ N ที่ และวันที่แก้ไม่ครบคือวันที่เอกสารเริ่มโกหก

| ข้อเท็จจริงชนิดไหน | บ้านของมัน |
| --- | --- |
| กฎที่ใช้กับทุกตาราง — FK, `org_id`, base entity, CHECK | [`02-database/rules.md`](./02-database/rules.md) · [`README`](./02-database/README.md) |
| ตารางไหนมีฟิลด์อะไร | [`02-database/schema.md`](./02-database/schema.md) |
| stack · module boundary · auth · API convention · retention | [`01-architecture.md`](./01-architecture.md) |
| ทำอะไร phase ไหน อันไหนก่อน | [`03-roadmap.md`](./03-roadmap.md) |
| ฟีเจอร์นี้ทำงานยังไง | [`04-features/phase-N.md`](./04-features/README.md) |
| คำที่ชนกันได้ | [Glossary](#glossary) ในไฟล์นี้ |
| **ทำไมโค้ดบรรทัดนี้เขียนแบบนี้ · สิ่งที่วัดมาแล้ว** | **docblock ในไฟล์นั้นเอง** |

แถวสุดท้ายคือแถวที่ลืมกันบ่อยที่สุด — เหตุผลระดับโค้ดอยู่ในโค้ด ไม่ใช่ในเอกสาร เพราะคนที่ต้องรู้คือคนที่กำลังเปิดไฟล์นั้นอยู่ และ docblock เป็นที่เดียวที่ **diff จะบังคับให้เห็นตอนแก้โค้ด**

`CLAUDE.md` เป็นดัชนี ไม่ใช่บ้าน — เก็บได้แค่ *ข้อเท็จจริงที่เปลี่ยนการตัดสินใจในไฟล์อื่น* ส่วน *ทำไม* ให้ลิงก์ไปบ้านมัน

---

## Where to Find Things

| อยากรู้                                   | ไฟล์                                                      |
| --------------------------------------- | -------------------------------------------------------- |
| ใช้ stack อะไร โครง repo เป็นยังไง         | [`01-architecture.md`](./01-architecture.md)             |
| Module แบ่งยังไง กติกาการเรียกข้าม module    | [`01-architecture.md`](./01-architecture.md)             |
| API path / error format / naming / auth | [`01-architecture.md`](./01-architecture.md#conventions) |
| ตารางไหนมีฟิลด์อะไร FK ชี้ทางไหน             | [`02-database/README.md`](./02-database/README.md)                     |
| จะทำอะไรบ้าง phase ไหน อันไหนสำคัญก่อน      | [`03-roadmap.md`](./03-roadmap.md)                       |
| รายละเอียดของ feature แต่ละอัน             | [`04-features/`](./04-features/README.md) — แยกตาม phase        |
| SaaS / billing / pricing / AI ที่ใช้ LLM   | [`05-saas-notes.md`](./05-saas-notes.md)                 |

## Where to Start

| ถ้าคุณ                     | อ่านตามลำดับนี้                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| กำลังจะเริ่มเขียนโค้ด | ไฟล์นี้ → `01-architecture.md` → `02-database/README.md` → [`04-features/phase-1.md`](./04-features/phase-1.md) (Phase 0 ปิดแล้วที่ `v0.1.0`)                            |
| อยากรู้ภาพรวมว่าทำอะไรบ้าง   | ไฟล์นี้ → `03-roadmap.md`                                                                                  |
| กำลังทำ phase ใดอยู่        | `03-roadmap.md` (ดู priority) → `04-features/phase-N.md` (ดูรายละเอียด)                                            |
| กำลังจะแตะ schema         | [Binding Decisions](#binding-decisions) → `02-database/README.md` → หัวข้อ Build From Day One ใน `03-roadmap.md` |
| กำลังคิดเรื่องขาย            | `05-saas-notes.md`                                                                                      |

---

## The Problem

ตอนนี้ทีมจดงานกันในแชท — งานหายไปในบทสนทนา ไม่รู้ว่าใครรับผิดชอบอะไร ไม่รู้ว่าค้างตรงไหน และย้อนกลับไปหาไม่เจอ

เป้าหมายไม่ใช่การทำ Notion/Jira อีกตัว แต่คือ**ระบบที่คนในบริษัทใช้จริงโดยไม่รู้สึกว่ายากกว่าพิมพ์ในแชท**

## Who Uses It, Who Builds It

- ผู้ใช้ประมาณ 20 คน/วัน (บริษัทมีราว 100 คน)
- ทีมพัฒนา = พวกเราเอง ทำนอกเวลา
- Deploy บนเซิร์ฟเวอร์ในไทย (Bangmod) ข้อมูลไม่ออกนอกประเทศ

---

## Glossary

อ่านตรงนี้ก่อนแตะโค้ด — คำเหล่านี้ซ้อนทับกันได้ง่าย

| คำ                     | คืออะไร                                                                              | ไม่ใช่อะไร                  |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| **System**             | ระดับทั้งเว็บ — พวกเราดูแล · RBAC · ไม่ผูกกับ org ใด · 2-5 คน                               | ไม่ใช่ role ของลูกค้า         |
| **Organization (org)** | ชั้นบนสุดของลูกค้า = 1 บริษัท · ข้อมูลทุกอย่างผูกกับ org · **1 คนอยู่ได้หลาย org ตั้งแต่ Phase 1** · 1 request ทำงานให้ org เดียวเสมอ | ไม่ใช่ทีม ไม่ใช่แผนก           |
| **Team**               | กลุ่มคนตามโครงสร้างองค์กร · 1 คนอยู่ได้หลายทีม · ใช้ assign งานเป็นกลุ่ม                        | ไม่ได้ผูกกับ project แบบตายตัว |
| **Project**            | ที่เก็บงาน · มี member ของตัวเองอิสระจากทีม (แบบ Slack channel) · มี custom status ของตัวเอง | ไม่ใช่ของทีมใดทีมหนึ่ง          |
| **System role**        | สิทธิ์ระดับทั้งเว็บ (`identity.roles`) · พวกเราดูแล                                         | ไม่ใช่ role ใน org          |
| **Task**               | หน่วยงานเดียว · อยู่ใน project เสมอ · มี sub-task ได้ 2 ชั้น                                | —                         |
| **Sub-task**           | Task ที่มี `parent_task_id` · เป็น task เต็มตัว มี status/assignee ของตัวเอง                | ไม่ใช่แค่ checklist          |
| **Sprint**             | รอบการทำงาน · เป็น optional ต่อ project (`sprint_enabled`)                            | ไม่บังคับใช้                  |
| **Activity log**       | ชื่อ**ฟีเจอร์**ที่ผู้ใช้เห็น — เก็บใน `audit.logs` ดูแลโดย module `audit/`                      | ไม่ใช่ชื่อ schema             |

### Permission Hierarchy

```
System  (ทั้งเว็บ — พวกเราดูแล)   RBAC · ข้าม org ได้
  ▼
Org  (ลูกค้าสร้างกันเอง)          owner / admin / member
  ├─ Team                        admin / member
  └─ Project                     admin / member
```

สองชั้นนี้แยกขาดจากกัน — รายละเอียดใน [`01-architecture.md`](./01-architecture.md#permission-hierarchy)

### `workspace` = Yarn Workspace Only

คำว่า `workspace` เหลืออยู่ที่เดียวคือ **Yarn workspace** (เครื่องมือจัดการ monorepo — repo นี้ใช้ Yarn 4 Berry ไม่ใช่ pnpm) — ไม่ใช่ชื่อ entity, module หรือ schema

เดิมเคยใช้เป็นชื่อ schema ที่เก็บ project แต่เปลี่ยนเป็น `project` แล้วเพื่อไม่ให้กำกวม

---

## Decision Principles

**1. แก้ยากทำตอนนี้ แก้ง่ายไว้ทีหลัง**

> สิ่งที่แก้ยากทีหลัง (schema, ID, log, API contract) → ลงทุนตั้งแต่แรก
> สิ่งที่แก้ง่าย (UI, feature logic, infra) → ทยอยทำทีหลัง

ที่ Phase 0 ต้องครบคือ **คอลัมน์** ไม่ใช่ทุกตาราง — เพิ่มตารางใหม่บนฐานข้อมูลที่มีข้อมูลแล้วราคาถูก
ที่แพงคือการแก้ตารางเดิม ([ตารางที่ตั้งใจสร้างทีหลัง](./04-features/phase-0.md)) แล้วค่อยทยอยเปิด UI
ทีละ phase — ไม่มีอะไรถูกทิ้ง แค่เลื่อนงานหน้าบ้าน

**2. ทำเป็น setting แทนการเลือกข้าง**

เมื่อไม่แน่ใจว่าควรทำแบบไหน ให้เป็นตัวเลือกระดับ project (`completion_policy`, `sprint_enabled`, `estimate_unit`) — ต้นทุนแค่ column เดียว แต่ไม่ต้องเถียงกันและไม่ต้องรื้อทีหลัง

**3. อย่า over-engineer จนไม่ได้ปล่อยของ**

ไม่ทำ microservices, event sourcing, real-time infra, DDD 4 ชั้น — ของพวกนี้เพิ่มทีหลังได้โดยไม่ต้องรื้อ

**4. เป้าหมายสำคัญที่สุด: มีคนใช้จริงให้เร็วที่สุด — เส้นนั้นคือจบ Phase 3 (~14 สัปดาห์)**

ระบบ task ภายในบริษัทมักตายเพราะ**คนไม่เข้ามาอัปเดต** ไม่ใช่เพราะฟีเจอร์ไม่พอ ของที่ปล่อยแล้วมีคนใช้จริงจะสอนสิ่งที่ spec สอนไม่ได้

> **ถ้าเวลาไม่พอให้ตัด 🟡 กับ 🟢 ออก อย่าเลื่อนวันปล่อย** — วันที่เลื่อนได้เรื่อยๆ คือวันที่ไม่มีจริง

**5. ตอนสองข้อชนกัน เรียงตามนี้**

1. **ข้อมูลไม่พัง และไม่รั่ว** — correctness กับ security อยู่ด้วยกัน ไม่แลกกัน ·
   `org_id` isolation เป็นทั้งสองอย่างพร้อมกัน
2. **รูปร่างของ schema กับ API**
3. **UX + performance**
4. **Clean code**
5. **UI**

เกณฑ์ที่เรียงคือ **พลาดแล้วย้อนแพงแค่ไหน** ไม่ใช่คำไหนฟังดูสำคัญกว่า — แถวรั่วแล้วรั่วเลย ·
แก้ `tasks` ตอนมีข้อมูลหกเดือนคือ full-table migration บวกทุก client · ส่วน UI แก้วันไหนก็ได้

**เป็นตัวตัดสินตอนชนกัน ไม่ใช่ลำดับการทำงาน** — ไม่ใช่ "ทำ security ให้เสร็จก่อนค่อยแตะ UI"
และคนละเรื่องกับ [`definition-of-done.md`](../checklists/definition-of-done.md) ที่บอกว่าอะไร
ต้องจริงก่อนปิดงาน · UI อยู่ท้าย **ไม่ใช่เพราะส่งขี้เหร่ไปก่อนได้** — design เสร็จแล้วและมันคือ
สเปกของ UI ไม่ใช่ของที่เอาไว้แลก · ข้อ 3 เหนือข้อ 4 แปลว่า denormalize / เพิ่ม index ชนะ
ความสะอาดได้ **เมื่อวัดแล้ว ไม่ใช่เดา** อย่างคอลัมน์ `depth` บน `task.tasks`

---

## Binding Decisions

🔒 **ทั้งหมดในรายการนี้เปลี่ยนไม่ได้โดยไม่แก้เอกสาร** — ที่เหลือทั้งเอกสารเป็นแนวทาง

เกณฑ์เดียวที่ทำให้อะไรมาอยู่ในรายการนี้: **เบี่ยงเบนแล้วแก้ย้อนหลังไม่ได้ หรือแก้ได้ด้วยราคาที่สูงเกินรับ**

| ข้อ                                                               | ถ้าทำผิด                                                           | อยู่ที่                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| วันเวลาใช้ `timestamptz` เท่านั้น เก็บ UTC (ห้าม `timestamp`)           | ต้อง migrate ทุกตารางที่มีวันเวลา และข้อมูลเก่าตีความไม่ได้                  | [`01-architecture.md`](./01-architecture.md#data-types)                                        |
| `org_id` ทุกตารางที่แถวเป็นของ org ใด org หนึ่ง (ยกเว้น `identity`, `billing.plans`, `organizations` ที่ไม่เป็นของ org ไหน · และ `notify.outbox` ที่ **nullable** เพราะเมลรีเซ็ตรหัสผ่านเป็นของ *บัญชี* ไม่ใช่ของ org — [เหตุผล](./02-database/schema.md#schema-notify)) + ต้องมี isolation test | ข้อมูลข้ามบริษัทรั่ว — พลาดครั้งเดียวจบ                                    | [`02-database/rules.md`](./02-database/rules.md#multi-tenancy)                                           |
| Unique constraint ของตาราง soft delete ต้องเป็น **partial index**  | ลบแล้วสร้างชื่อเดิมไม่ได้ตลอดไป                                         | [`01-architecture.md`](./01-architecture.md#soft-delete)                                       |
| `UNIQUE (project_id, number)` ของ `task.tasks` เป็น **index เต็ม ไม่ใช่ partial** — ข้อยกเว้นเดียวของแถวบน | เลขงานถูกแจกซ้ำ · `DEV-87` ที่แปะไว้ในแชทไปโผล่บนงานคนละใบ ตามแก้ย้อนหลังไม่ได้ | [`02-database/schema.md`](./02-database/schema.md#schema-task) |
| `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT`      | ลบ user แล้วประวัติงานพัง — การลบ user คือ anonymize ไม่ใช่ hard delete | [`01-architecture.md`](./01-architecture.md#fk-on-delete)                                      |
| `audit.logs` partition รายเดือน + `PRIMARY KEY (id, occurred_at)` | ทำทีหลังต้องย้ายข้อมูลทั้งตาราง · PK เดี่ยวสร้างไม่ผ่านตั้งแต่แรก                | [`01-architecture.md`](./01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime) |
| `audit.logs` ห้ามลบ                                               | ประวัติที่ต้องใช้ตรวจสอบสร้างใหม่ไม่ได้                                    | [`02-database/schema.md`](./02-database/schema.md#schema-audit)                                              |
| Audit row เขียนใน transaction เดียวกับ business logic               | log หายเงียบๆ เมื่อ listener throw — ไม่มี error บอก                  | [`01-architecture.md`](./01-architecture.md#how-the-activity-log-is-written)                   |
| Primary key เป็น UUID                                             | เปลี่ยนทีหลังต้องแตะทุก FK ทุกตาราง                                     | [`02-database/rules.md`](./02-database/rules.md#base-entity)                 |
| `sort_order` เป็น `text COLLATE "C"` + fractional indexing        | เรียงไม่ตรงกันข้ามเครื่อง/locale และ drag & drop ต้อง update ทุกแถว      | [`01-architecture.md`](./01-architecture.md#lexorank--sort_order)                              |
| 1 `external_channel_id` ผูกได้ org เดียว                            | ข้อความจากห้องแชทเดียวเข้าได้หลายบริษัท = ข้อมูลข้ามบริษัท                   | [`02-database/schema.md`](./02-database/schema.md#schema-chat-phase-4)                                       |

### ❓ ยังไม่ตัดสิน

| เรื่อง                             | ตัดสินเมื่อไหร่                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Transaction strategy ตอนเปิด RLS  | ตอนต้น Phase 2 พร้อมโค้ดจริง — [`01-architecture.md`](./01-architecture.md#transaction) |
| ทุกอย่างใน `05-saas-notes.md`      | เมื่อ Phase 1-6 มีคนใช้จริงต่อเนื่อง และมีคนนอกถามหา                                         |
| เคสของ chat integration ตอนทำจริง | ตอนลงมือทำ Phase 4 — [`04-features/phase-4.md`](./04-features/phase-4.md)                            |

---

## What's in Each File

### [`01-architecture.md`](./01-architecture.md)

1. Tech Stack — stack, โครง repo, docker-compose
2. Modular Monolith — module, กติกาการเรียกข้าม module, Query Service, การอ่าน audit log
3. Conventions — API, naming, auth, implementation notes

### [`02-database/`](./02-database/README.md)

แยกสามไฟล์ตามวิธีที่ถูกใช้จริง — กติกาอ่านตั้งแต่ต้นจนจบ ส่วนตารางเปิดหาทีละอัน

1. [`rules.md`](./02-database/rules.md) 🔒 — FK · Multi-tenancy · Base Entity · กฎ `org_id` · **อ่านก่อนเขียน migration**
2. [`schema.md`](./02-database/schema.md) — ทุกตาราง ทุกฟิลด์ ทุก schema
3. [`README.md`](./02-database/README.md) — Schema Map ว่าตารางไหนอยู่ schema ไหน + Other Notes

### [`03-roadmap.md`](./03-roadmap.md)

1. Roadmap — phase, version, ประเมินเวลา
2. Feature List — ทุก feature พร้อม priority 🔴🟡🟢
3. Build From Day One, Even Without UI
4. Cautions

### [`04-features/`](./04-features/README.md)

รายละเอียดแต่ละ feature **แยกไฟล์ตาม phase** — ทำงาน phase ไหนเปิดไฟล์นั้นไฟล์เดียว

[`phase-0.md`](./04-features/phase-0.md) … [`phase-6.md`](./04-features/phase-6.md) · ลำดับหัวข้อตรงกับตารางใน [`03-roadmap.md`](./03-roadmap.md) · [`on-hold.md`](./04-features/on-hold.md) คือของที่ตัดสินแล้วว่ายังไม่ทำ รอเงื่อนไข ไม่ใช่รอคิว

### [`05-saas-notes.md`](./05-saas-notes.md)

บันทึกความคิดเผื่ออนาคต — **ไม่ใช่แผนที่ต้องทำ** · Phase 7-8, pricing, billing, AI (LLM)
