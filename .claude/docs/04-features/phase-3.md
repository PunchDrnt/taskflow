# Phase 3 — Collaboration `v1.2.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

- **Kanban board** — drag & drop (LexoRank ได้ใช้จริง), จัดกลุ่มตาม status

  **Sub-task แสดงเป็นการ์ดแยก** พร้อมตัวบอกว่าเป็นลูกของใคร

  ```
  ┌─────────────────────┐
  │ ↳ ออกแบบ mockup      │
  │   จาก: ทำหน้า login   │
  │   👤 สมชาย            │
  └─────────────────────┘
  ```

  เหตุผล: Kanban คือเครื่องมือติดตาม flow ของงาน ถ้าซ่อน sub-task คนที่ถูก assign จะไม่เห็นงานตัวเองบน board
  (ต่างจาก List view ที่ใช้ `WHERE depth = 0` เพราะแสดงแบบ indent อยู่แล้ว)

  มี toggle "ซ่อนงานย่อย" สำหรับ PM ที่อยากดูภาพรวมระดับบน

- **Sprint board** — Kanban ที่ filter ด้วย sprint (ไม่ต้องเขียน view ใหม่) · แสดง sub-task เหมือน Kanban ปกติ และใช้ toggle "ซ่อนงานย่อย" ตัวเดียวกัน
- **ปิด sprint + carry over** — ตอนปิด sprint ระบบถามว่างานที่ยังไม่ `is_done_type` จะเอาไปไหน:
  - ย้ายไป sprint ถัดไป (default)
  - เอากลับ backlog (`sprint_id = null`)
  - ปิดทิ้ง → เปลี่ยนเป็น status ที่เป็น `is_cancelled_type` (ไม่ใช่ `is_done_type`) เพราะไม่ได้ทำจริง — มีผลกับ velocity ใน Phase 4

  ห้ามย้ายอัตโนมัติเงียบๆ · บันทึกลง activity log ว่า task carry over มากี่รอบแล้ว — ข้อมูลนี้มีค่ามากตอนรีวิว

- **Table view**
- **Comment + thread** (`parent_comment_id`) — โครงแบบ Slack
- **ไฟล์แนบ** — object storage (Garage) + presigned URL
- **Activity log UI** — ข้อมูลเก็บมาตั้งแต่ Phase 0 แล้ว
- แจ้งเตือนครบชุด — ใกล้ deadline, mention, comment ใหม่, status เปลี่ยน
- Tag / Label
- **Chat Integration — Line** (adapter ที่สองบนโครงเดียวกับ Discord)

## Stale Detection

ตรวจเองว่างานไหนค้างผิดปกติ แล้วเตือนคนที่ควรรู้

> "3 งานนี้ไม่มีความเคลื่อนไหว 8 วัน — งานปกติของทีมคุณใช้เวลาเฉลี่ย 3 วัน"

- ต่างจากเตือน deadline ทั่วไปตรงที่**จับปัญหาก่อนถึง deadline**
- เทียบกับพฤติกรรมจริงของทีมนั้น ไม่ใช่กฎตายตัว
- ใช้ activity log ที่เก็บมาตั้งแต่ Phase 0 — **ไม่ต้องใช้ AI เลย**
- ส่งเข้าแชทได้ผ่าน adapter ที่ทำไว้แล้ว

---
