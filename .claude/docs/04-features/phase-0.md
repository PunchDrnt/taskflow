# Phase 0 — Foundation `v0.1.0`

> [← Feature Specifications](./README.md) · [ลำดับและ priority](../03-roadmap.md)

---

ไม่มีฟีเจอร์ให้ใช้ แต่เป็นฐานทั้งหมด

- Setup monorepo (Yarn 4 Berry + Turborepo)
- Docker compose ครบ (api, web, postgres, postgres-test, garage, caddy) — ตอนนี้มี postgres + postgres-test + garage
- **สร้าง schema ครบทุก module ตั้งแต่รอบนี้** — รวม `sprints` + `tasks.sprint_id` + `tasks.estimate` ด้วย (เติมทีหลังต้อง migrate `tasks` ซึ่งเป็นตารางใหญ่สุด)
  - ข้อยกเว้นเดียว: `chat.identities` / `chat.channels` สร้างตอน Phase 2 — เป็นตารางอิสระ ไม่มีใครชี้มาหา
- Base entity — UUID, `org_id`, `created_at/by`, `updated_at/by`, `deleted_at/by` · วันเวลาใช้ `timestamptz` ทั้งหมด ([schema เต็ม](../02-database/rules.md#base-entity))
- `users.status` เป็น string ('active' | 'deactivated' | 'pending_deletion' | 'deleted') + unique index อีเมลแบบ partial
- Global `org_id` scoping — **repository base class + isolation test** ([วิธี implement](../01-architecture.md#org_id-scoping)) · **RLS เลื่อนไป Phase 2** เพราะ `CREATE POLICY` เพิ่มทีหลังได้โดยไม่ต้อง migrate
- Migration เขียนมือทั้งหมด · `synchronize: false` ถาวร — `synchronize` สร้าง partition, partial index, `COLLATE "C"` และ extension ให้ไม่ได้
- **Seed system user เป็น migration แรก** — base entity บังคับ `created_by NOT NULL` ทุกตารางรวม `identity.users` เอง แถวแรกจึงต้อง insert โดยชี้ `created_by` มาที่ id ของตัวเอง (Postgres ทำได้ใน INSERT เดียว แต่ต้องตั้งใจวางลำดับ)
- Permission layer `can(user, action, resource)` (CASL) โครงเปล่า
- Activity log service — **เขียน audit row ใน transaction เดียวกับ business logic** ไม่ผ่าน event emitter ([เหตุผล](../01-architecture.md#how-the-activity-log-is-written)) · event emitter มี consumer เดียวคือ notification จนถึง Phase 5 ที่ [Automation](./phase-5.md#automation) มาเป็นตัวที่สอง — audit ยังห้ามเดินทางเส้นนี้เหมือนเดิม
- `StorageService` ห่อ Garage (S3) — [ทำไมไม่ใช่ MinIO](../01-architecture.md#object-storage)
- `EmailService` ห่อ Resend + outbox worker
- CI/CD + **deploy ขึ้น Bangmod ให้ได้จริง**
- Error tracking (Sentry)
- Seed script สำหรับ dev/demo
- ตาราง RBAC ระดับระบบ (`identity.roles`, `permissions`, `role_permissions`, `user_roles`) + seed permission keys — **ไม่มีโค้ดอ่าน** back-office มา Phase 7 ([ลำดับชั้นสิทธิ์](../01-architecture.md#permission-hierarchy))

> deploy pipeline ที่ทำทีหลังมักกลายเป็นคอขวด — ต้องได้ deploy จริงตั้งแต่ Phase 0 แม้จะเป็นหน้าเปล่า

---
