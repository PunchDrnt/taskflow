# Definition of Done

เช็คก่อนปิดงานหนึ่งชิ้น — ใช้ซ้ำทุกครั้ง ไม่ผูกกับ phase

> ไม่ใช่ทุกข้อจะเกี่ยวกับทุกงาน · ข้ามข้อที่ไม่เกี่ยวได้ แต่ข้อที่ 🔒 ห้ามข้าม

---

## 1. โค้ดทำงานจริง

- [ ] `yarn lint` · `yarn check-types` · `yarn test` · `yarn format:check` ผ่านหมด
- [ ] **รันของจริงแล้วเห็นว่าทำงาน** ไม่ใช่แค่ compile ผ่าน
  - แตะ API → ยิง endpoint จริง เช็ค status + body
  - แตะ schema → รัน migration ขึ้น-ลงจริง (`up` แล้ว `down` แล้ว `up` อีกรอบ)
  - แตะ UI → เปิดดูจริง
- [ ] ทางที่ผิดพลาดได้ก็ลองแล้ว ไม่ใช่แค่ happy path

## 2. Database (ถ้าแตะ schema)

- [ ] 🔒 วันเวลาเป็น `timestamptz` · เก็บ UTC
- [ ] 🔒 มี `org_id` (ยกเว้น schema `iam` และ `billing.plans`)
- [ ] 🔒 unique constraint ของตารางที่ soft delete เป็น **partial index**
- [ ] 🔒 `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT`
- [ ] 🔒 `sort_order` เป็น `text COLLATE "C"`
- [ ] Composite index ขึ้นต้นด้วย `org_id`
- [ ] Migration เขียนมือ ไม่ได้พึ่ง `synchronize`
- [ ] Migration `down` เขียนแล้วและลองแล้วจริง

## 3. Query และ transaction

- [ ] Service ใช้ `OrgScopedRepository` ไม่ได้ inject `Repository<T>` ตรง
- [ ] ข้าม org scope ต้องมี `@SkipOrgScope()` ประกาศชัด ไม่ bypass เงียบๆ
- [ ] Write อยู่ใน transaction · read ไม่ต้อง
- [ ] 🔒 Audit row เขียนใน transaction เดียวกับ business logic
- [ ] Domain service ไม่ join ข้าม module — ต้อง join ให้ใช้ `*.query-service.ts`
- [ ] Query service **ไม่เขียนข้อมูล** และถูกเรียกจาก controller เท่านั้น

## 4. Test

- [ ] งานที่แตะ org scoping → มี test ว่า org A มองไม่เห็นข้อมูล org B
- [ ] งานที่แตะ permission → มี test ว่าแต่ละ role ทำอะไรได้/ไม่ได้
- [ ] งานที่แตะ invariant ที่ **DB บังคับเองไม่ได้** → มี test · เงื่อนไขข้ามตารางหรือแบบ "อย่างน้อย 1 แถว" เขียนเป็น `CHECK` / `UNIQUE` ไม่ได้ ถ้าไม่มี test ก็ไม่มีอะไรคุมเลย — เช่น org ต้องมี `owner` ≥1 · project ต้องมี `is_done_type` ≥1 · `completed_at` ต้องสอดคล้องกับ `is_done_type` ของ status ที่ task ใช้อยู่
- [ ] Test รันซ้ำได้ ไม่พึ่งลำดับ ไม่พึ่ง state ที่ test อื่นทิ้งไว้

## 5. API (ถ้าเพิ่ม/แก้ endpoint)

- [ ] Path nested แค่ชั้นเดียว · resource เป็นพหูพจน์ · แก้ไขใช้ `PATCH` ไม่ใช่ `PUT`
- [ ] Error format ตาม [convention](../docs/01-architecture.md#api) — มี `code` คงที่ให้ frontend เช็ค + `message` ภาษาไทย
- [ ] HTTP status ตรงตามตาราง (`404` เมื่ออยู่คนละ org ไม่ใช่ `403`)
- [ ] List ใช้ cursor pagination ไม่ใช่ offset
- [ ] Swagger แสดงผลถูก

## 6. เอกสาร

- [ ] 🔒 **ทำต่างจากข้อที่ล็อกไว้ → แก้ docs ในการเปลี่ยนแปลงเดียวกัน และพูดออกมา ห้ามเงียบ**
- [ ] ทำต่างจากแนวทาง → บอกว่าเบี่ยง · ถ้าถาวรค่อยแก้ docs
- [ ] ตัดสินข้อที่เป็น ❓ แล้ว → บันทึกลง docs
- [ ] เพิ่ม env var → เพิ่มใน `config/env.ts` **และ** `.env.example`
- [ ] เพิ่ม dependency ที่มี indicator ได้ (DB, cache, upstream) → ใส่ใน **readiness** ไม่ใช่ liveness
- [ ] เพิ่ม/แก้ component ใน `@repo/ui` → อัปเดตหน้า `/design-system`

## 7. Commit

- [ ] Conventional Commits: `type(scope): subject` · imperative · ตัวเล็ก · ไม่เกิน ~72 ตัว · ไม่มีจุดท้าย
- [ ] Scope เป็น workspace หรือพื้นที่ที่แตะ — `api` `web` `ui` `shared` `config` `deps` `repo`
- [ ] Body บอก **ทำไม** ไม่ใช่ทำอะไร (diff บอกอยู่แล้วว่าทำอะไร)
- [ ] 1 commit = 1 เรื่อง
- [ ] ไม่มีไฟล์หลุด — `git status` สะอาดหลัง commit
- [ ] ไม่มี secret / credential / `.env` จริงติดไปด้วย

## 8. ก่อนบอกว่าเสร็จ

- [ ] เล่าได้ว่า**ทดสอบอะไรไปบ้างจริงๆ** ไม่ใช่แค่ "น่าจะทำงาน"
- [ ] ถ้ามีอะไรไม่ได้ทำ / ทำไม่ครบ → บอกออกมา อย่าปล่อยให้ไปเจอเอง
- [ ] ถ้ามีอะไรทำนอกเหนือจากที่ตกลง → สรุปเป็นรายการแยก ให้ย้อนได้
