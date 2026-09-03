# Phase 5 — Advanced Features + Semantic Search `v2.0.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

- Nested page — พิจารณาปลด `MAX_TASK_DEPTH` เป็น 3 ชั้น
- Template สำเร็จรูป (Sprint, Bug tracker, Meeting notes)
- Rich text editor แบบ `/` command
- Timeline / Gantt view
- Recurring task
- Time tracking
- `completion_policy: all_assignees`

## Task Dependency

ใช้ข้อมูลที่มีอยู่แล้ว (task, due date, status) แค่เพิ่มความสัมพันธ์ แล้วได้ของต่อเนื่องมาหลายอย่าง:

- Gantt ที่มีความหมายจริง — **ทำคู่กับ Timeline/Gantt คุ้มกว่าแยกทำ** Gantt ที่ไม่มี dependency คือแผนภูมิแท่งเฉยๆ
- เตือนอัตโนมัติ "งาน A เลื่อน → B, C ที่รออยู่จะเลื่อนตาม"
- หา critical path ได้
- ต่อยอด [Stale Detection](./phase-3.md#stale-detection) — "งานนี้ไม่ขยับเพราะรออะไรอยู่"

[Schema เต็ม + composite FK + recursive CTE กัน cycle](../02-database/schema.md#schema-task) — สามอย่างที่ต้องระวัง:

| | |
| --- | --- |
| **กัน cycle** | `A → B → A` · FK กันไม่ได้ ต้องเช็คตอน insert ด้วย recursive CTE |
| **เตือน ไม่บล็อก** | อย่าห้ามเปลี่ยน status ของ successor ทั้งที่ predecessor ยังไม่เสร็จ · หลักเดียวกับ prompt ตอนปิด parent ที่มี sub-task ค้าง |
| **`finish_to_start` อย่างเดียว** | SS/FF/SF ของ MS Project แทบไม่มีใครใช้ · คอลัมน์ `type` เผื่อไว้แล้ว เพิ่มทีหลังไม่ต้อง migrate |

## Automation

สิ่งเดียวในลิสต์นี้ที่ทำให้ระบบ **ทำงานแทนคน** ไม่ใช่แค่บันทึกสิ่งที่คนทำ

```
Trigger → Condition → Action
```

**Action ที่คุ้มที่สุด 5 อย่าง** — เปลี่ยน status · assign ให้คน/ทีม · ตั้ง due date (+N วันจาก trigger) · ส่งแจ้งเตือน/เข้าแชท · สร้าง sub-task จาก template

```
เมื่อ status → "รอตรวจ"     ⇒ assign ให้ทีม QA
เมื่อถูกสร้างใน project X   ⇒ ตั้ง due date +3 วัน
เมื่อเลย due date 2 วัน      ⇒ แจ้งเข้าห้อง Discord
เมื่อ status → "Done"        ⇒ แจ้งคนสร้าง task
```

**ต้องรอ Phase 4** — ถ้าไม่มี custom field กับ custom status ครบ เงื่อนไขที่ตั้งได้จะมีไม่กี่แบบจนไม่คุ้มทำ

**Trigger มีสองชนิด** และนี่คือจุดที่พลาดง่ายที่สุด — [ตารางเต็ม](../02-database/schema.md#schema-automation-phase-5) · ย่อ: เหตุการณ์มาจาก event emitter (`task.created` · `task.assigned` · `task.completed` มีแล้ว · `task.status_changed` ต้องเพิ่ม) ส่วนเงื่อนไขเรื่อง**เวลา**มาจาก cron ไม่ใช่ event เพราะไม่มีการกระทำของใครให้ยิง มีแต่เวลาที่เดินผ่านไป

> 🔒 **action ต้องเดินผ่าน outbox ไม่ใช่ listener เปล่า** — emitter ยิงหลัง commit แบบ fire-and-forget listener ที่พังทำให้งานหายเงียบ **เหตุผลเดียวกับที่ audit ห้ามใช้ emitter** · notification รอดมาได้เพราะมี outbox + retry อยู่แล้ว แต่ automation _เขียนข้อมูล_ — พังเงียบแปลว่างานไม่ถูก assign โดยไม่มีใครรู้ ต่างจากอีเมลไม่ถึงที่คนทักมาเอง

**กันลูป: นับความลึกสูงสุด 3 ชั้น** — เลือกทางนี้แทน "action จาก automation ไม่ trigger ตัวอื่น" เพราะ chain คือประโยชน์ครึ่งหนึ่งของฟีเจอร์ · ทุกครั้งที่ทำงานต้องลง `audit.logs` ด้วย actor = system user + rule id ไม่งั้นจะมีการเปลี่ยนแปลงที่ไม่มีใครรับผิดชอบ

## Semantic Search + Duplicate Detection

ใช้ **embedding อย่างเดียว ไม่ต้องมี LLM** — ต้นทุนเกือบเป็นศูนย์ จึงทำได้ก่อนถึง SaaS

- **Semantic search** — ค้น "งานเกี่ยวกับระบบจ่ายเงิน" แล้วเจอแม้ไม่มีคำนั้นตรงๆ
- **ตรวจงานซ้ำ** — ตอนสร้าง task เตือนว่า "มีงานคล้ายกันอยู่แล้ว" (ใช้ vector เดียวกัน)

**เทคนิค**

- Embedding model ตัวเล็กที่รองรับไทย (เช่น multilingual-e5-small, BGE-M3) — **รันบน CPU ได้ ไม่ต้องมี GPU**
- เก็บ vector ลง **pgvector** บน Postgres ที่มีอยู่แล้ว
- ตารางแยก `task.task_embeddings` ไม่ต้อง migrate `tasks` — [ดู schema เต็ม](../02-database/schema.md#schema-task)

> ⚠️ **pgvector เป็นงานฝั่ง deploy ไม่ใช่แค่ migration** — image `postgres:18-alpine`
> ที่ใช้อยู่ไม่มีไฟล์ของ extension นี้ติดมา `CREATE EXTENSION vector` จึงล้มทันทีไม่ว่า
> จะเป็น role ไหน · ต้องเปลี่ยน image หรือ build เอง แล้วทดสอบว่า backup/restore
> ยังทำงานได้ · **ประเมินเวลาข้อนี้ให้รวมงานนั้นด้วย**

- Embed ตอนสร้าง/แก้ title + description (ผ่าน event เหมือน activity log ไม่บล็อก request)
- ตรวจงานซ้ำ: cosine similarity ในขอบเขต project เดียวกัน + เตือนเฉยๆ ไม่บล็อกการสร้าง
- ต้อง scope ด้วย `org_id` เหมือนทุกตาราง

> AI feature ที่ต้องใช้ LLM (Chat → Task, สรุป comment thread, สรุป sprint) เลื่อนไป Phase 7 เพราะมีค่าใช้จ่ายต่อการเรียกจริง ควรรอให้มี billing รองรับก่อน

---
