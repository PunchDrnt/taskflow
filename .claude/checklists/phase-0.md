# Phase 0 — Foundation `v0.1.0`

ไล่ตามลำดับที่ทำได้จริง (ไม่ใช่ลำดับ priority ใน [`03-roadmap.md`](../docs/03-roadmap.md)) — ข้อล่างพึ่งข้อบน

> **สถานะไฟล์นี้:** ของชั่วคราว ลบทิ้งได้เมื่อ Phase 0 จบ · ไม่ใช่ spec
> ตัวสเปกจริงอยู่ที่ [`.claude/docs/`](../docs/) — ถ้าขัดกัน ให้เชื่อ docs
>
> 🔒 = [binding decision](../docs/00-overview.md#binding-decisions) ผิดแล้วแก้ย้อนหลังไม่ได้

---

## 0. เสร็จแล้ว (จาก session เตรียมของ)

- [x] Monorepo (Yarn 4 Berry + Turborepo) · เปลี่ยนชื่อเป็น taskflow
- [x] `packages/shared` — zod/type/constant ใช้ร่วมสองฝั่ง + lint กันไม่ให้ import framework
- [x] Env validation ด้วย zod ผ่าน `ConfigModule` — ค่าผิดล้มตอน boot (exit 1)
- [x] `useDefineForClassFields: false` — ต้องมีก่อนเขียน entity ตัวแรก
- [x] Vitest + `unplugin-swc` (esbuild emit decorator metadata ไม่ได้)
- [x] `docker-compose.yml` — `postgres` + `postgres-test` (tmpfs)
- [x] เอกสารทั้งชุดจัดใหม่ + marker 🔒 / ❓

---

## 1. Database — ต่อ DB ให้ติดก่อน

- [x] ติดตั้ง TypeORM 1.1 + `pg` + `@nestjs/typeorm` — **ไม่ใช้ `typeorm-naming-strategies`** (peer range ค้างที่ `^0.3.0` และ deep-import `typeorm/util/StringUtils` ซึ่งเป็น internal) เขียนเองที่ `src/database/snake-naming.strategy.ts` อัลกอริทึมเดียวกันเป๊ะ
- [x] `data-source.options.ts` — `SnakeNamingStrategy` (ไม่เขียน `@Column({ name })` ทีละฟิลด์)
  - [x] แยก `data-source.ts` (instance สำหรับ CLI) ออกจาก `data-source.options.ts` (ฟังก์ชันเปล่า) — ไฟล์เดียวกันทำให้ Nest import แล้วอ่าน `process.env` ตั้งแต่ตอน import ก่อน `ConfigModule` โหลด `.env` ทัน
- [x] 🔒 **`synchronize: false` ถาวร** — `synchronize` สร้าง partition / partial index / `COLLATE "C"` / extension ให้ไม่ได้ ทุก migration เขียนมือ
- [x] เพิ่ม `DATABASE_URL` เข้า zod schema ใน `apps/api/core/src/config/env.ts` (ไม่มี default — ตั้งผิดแล้วไม่ boot)
  - [x] `ConfigModule` ชี้ `envFilePath` มาที่ `.env` ราก repo — เดิม resolve จาก cwd จึงหาไม่เจอตอน `yarn dev`
- [x] Health check `/health/ready` เพิ่ม DB indicator (**readiness เท่านั้น ห้ามใส่ liveness**)
  - [x] ยืนยันแล้วด้วยการ stop postgres: `/health/live` → 200 · `/health/ready` → 503 `database: down`

## 2. Migration ชุดแรก — ลำดับสำคัญ

> CLI ต่อติดแล้ว — `yarn workspace @api/core migration:create|run|revert|show`
> รันกับ `dist/` ที่ `nest build` ออกมา ไม่ต้องมี TS loader และเป็น artefact ตัวเดียวกับที่ deploy
> ตาราง `migrations` ของ TypeORM อยู่ schema `public` (ที่เดียวที่ public มีตาราง)
>
> ⚠️ `migration:create` ออกไฟล์มาเป็น `import { MigrationInterface, QueryRunner }` ซึ่ง**พังใน ESM** — สองตัวนี้เป็น type ล้วน ไม่มีใน `typeorm/index.mjs` · ผ่าน `nest build` (CommonJS) แต่ Vitest ตายตอน import · eslint rule `consistent-type-imports` (เปิดเฉพาะโฟลเดอร์ `migrations/` — เปิดทั้ง repo จะไปลบ metadata ที่ NestJS DI ใช้) แก้ให้อัตโนมัติตอน commit

- [x] `001` extension: `citext` — ต้องมาก่อนตารางที่ใช้
  - **ไม่ลง `pgcrypto`** — `gen_random_uuid()` เป็นของ core มาตั้งแต่ PG 13 (เช็คกับ PG 18 แล้ว: `(core)`) ลงไปก็ไม่มีอะไรเรียกใช้
  - `citext` เป็น trusted extension → app user ที่ไม่ใช่ superuser ลงได้เอง (เกี่ยวกับข้อ §7)
- [x] `002` สร้าง schema ทั้ง 11 ตัว: `identity` `organization` `project` `task` `audit` `discussion` `field` `view` `chat` `notify` `billing`
  - ลิสต์เดิมในไฟล์นี้ตกหล่น `chat` ไป (เขียนว่า 11 แต่นับได้ 10) — ยึดตาม [Schema Map](../docs/02-database.md#1-schema-map)
  - สร้าง schema ครบทุกตัวตั้งแต่รอบนี้แม้ตารางจะมาทีหลัง — schema ไม่มีต้นทุน และ migration แรกของแต่ละ module จะได้ไม่ต้องจำว่าต้องสร้างบ้านตัวเองก่อน
  - `public` ไม่ต้องสร้าง (มีอยู่แล้ว) มีแค่ extension + ตาราง `migrations`
  - `down` ใช้ `DROP SCHEMA` เปล่า ๆ ไม่ใส่ `CASCADE` — ถ้ายังมีตารางค้างต้องพังให้เห็น ไม่ใช่ลบตารางที่ตัวเองไม่ได้สร้างทิ้งเงียบ ๆ
- [x] 🔒 **`003` `identity.users` + seed system user** — base entity บังคับ `created_by NOT NULL` ทุกตาราง**รวม `identity.users` เอง** แถวแรกชี้ `created_by` มาที่ id ตัวเอง
  - ง่ายกว่าที่เขียนเตือนไว้เดิม: ใส่ `id` เป็นค่าคงที่แล้ว `INSERT` เดียวจบ ไม่ต้อง `DEFERRABLE` ไม่ต้องแยกคำสั่ง (FK ตรวจหลังแถวลงแล้ว)
  - `is_system` + `password_hash` nullable — system user login ไม่ได้ในระดับ schema ไม่ใช่แค่ตกลงกันไว้
  - ⚠️ `ON DELETE RESTRICT` กันแถวนี้ไม่ได้ (อ้างตัวเอง ลบแล้วตัวอ้างหายพร้อมกัน) → ต้องมี trigger `BEFORE DELETE`
  - ทดสอบครบ 7 ทาง: system user ซ้ำ · system user มีรหัสผ่าน · `deleted_at` ไม่ตรง `status` · `created_by` ชี้ผี · `status` ผิดค่า · ลบ system user · อีเมลซ้ำ — ฟ้องหมดทุกข้อ
- [ ] 🔒 `audit.logs` — `PARTITION BY RANGE (occurred_at)` + **`PRIMARY KEY (id, occurred_at)`** (Postgres บังคับให้ partition key อยู่ใน PK · `PRIMARY KEY (id)` เฉยๆ สร้างไม่ผ่าน)
- [ ] Job สร้าง partition เดือนถัดไปล่วงหน้า
- [ ] ตารางที่เหลือตาม [`02-database.md`](../docs/02-database.md#5-full-schema) — **ครบทุกตารางตั้งแต่รอบนี้** ยกเว้น `chat.*` (Phase 2)

**ตรวจก่อนปิดข้อนี้**

- [ ] 🔒 ทุก column วันเวลาเป็น `timestamptz` — `grep -rn "timestamp[^t]" migrations/` ต้องไม่เจอ
- [ ] 🔒 ทุกตารางมี `org_id` ยกเว้น schema `identity` และ `billing.plans`
- [ ] 🔒 unique constraint ของตารางที่ soft delete เป็น **partial index** (`WHERE deleted_at IS NULL`) ไม่ใช่ `UNIQUE (...)` ธรรมดา
- [ ] 🔒 `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT`
- [ ] 🔒 `sort_order` เป็น `text COLLATE "C"`
- [ ] Composite index ขึ้นต้นด้วย `org_id` เสมอ
- [ ] Partial unique index เพื่อบังคับ "at most one" ผ่าน DB ไม่ใช่ app เท่านั้น:
  - [ ] `project.statuses`: `(project_id) WHERE is_default = true`
  - [ ] `project.sprints`: `(project_id) WHERE status = 'active'`
- [ ] `CHECK` บนคอลัมน์ที่ partial index อ่านค่ามันตรง ๆ ([เหตุผล](../docs/02-database.md#check-vs-enum)) — พิมพ์ผิดแล้วแถวหลุด index เงียบ ๆ ไม่มี error:
  - [ ] `identity.users.status`
  - [ ] `project.sprints.status`
  - [ ] `notify.outbox.status`
- [ ] ไม่มี `CREATE TYPE ... AS ENUM` ที่ไหนเลย — `grep -rn "AS ENUM" migrations/` ต้องไม่เจอ
- [x] Test กัน entity หลุดจาก migration — `test/schema-drift.spec.ts`
  - `synchronize: false` แปลว่า TypeORM ไม่เช็คให้เลยว่า entity ตรงกับ DB มั้ย (ต่างจาก Prisma ที่มี schema เดียวเป็นความจริง) · test นี้ให้ schema builder คำนวณว่า `synchronize` "จะรันอะไร" กับ DB ที่ migrate แล้ว — ถ้ามีอะไรให้รัน แปลว่าหลุดกัน
  - พิสูจน์แล้วสองทาง: entity มีคอลัมน์เกิน → จับได้ (`ADD "forgotten_column"`) · migration มีคอลัมน์เกิน → จับได้ (`DROP COLUMN "undeclared"`)
  - ⚠️ พอถึง partition / partial index / `COLLATE "C"` จะมี false positive เพราะ schema builder แทนค่าพวกนี้ไม่ได้ — แก้ด้วยการ ignore เฉพาะจุดพร้อมคอมเมนต์ **ห้ามผ่อน assertion**

## 3. Base entity + org scoping

- [ ] `shared/base.entity.ts` — 🔒 UUID pk, `org_id`, `created_at/by`, `updated_at/by`, `deleted_at/by`
  - [ ] `audit.logs` เป็นตารางเดียวที่ **ไม่ใช้ base entity ตรงๆ** (composite PK)
- [ ] TypeORM subscriber เติม `createdBy` / `updatedBy` / `deletedBy` จาก request context
- [ ] `shared/request-context.ts` — `AsyncLocalStorage<{ orgId, userId }>`
- [ ] Guard ใส่ค่า context ตอนต้น request
- [ ] `OrgScopedRepository<T>` — ทุก service ใช้ตัวนี้ ห้าม inject `Repository<T>` ตรง
- [ ] ESLint rule ห้าม inject `Repository<T>` ธรรมดา
- [ ] `@SkipOrgScope()` decorator สำหรับ endpoint ที่ต้องข้ามจริงๆ
- [ ] 🔒 **Integration test: query จาก org A ต้องมองไม่เห็นข้อมูล org B** — รันกับ `postgres-test` ข้อนี้ไม่มีข้อยกเว้น
  - [x] โครง integration test พร้อมแล้ว — `test/database.ts` + `test/README.md` · ต่อ `postgres-test` แล้วรัน migration ให้เอง

> ❓ RLS **ไม่ทำใน phase นี้** — เลื่อนไป Phase 2 พร้อมเรื่อง transaction strategy

## 4. Soft delete

- [ ] `@DeleteDateColumn` — TypeORM กรอง `deleted_at IS NULL` ให้อัตโนมัติ
- [ ] จุดที่ TypeORM **ไม่ครอบคลุม** ต้องทำเอง: raw query / QueryBuilder · relation ที่ join มา · unique constraint · `deleted_by`
- [ ] Cascade soft delete เขียนใน service เอง (`ON DELETE CASCADE` ทำงานกับ hard delete เท่านั้น)

## 5. Permission + Activity log

- [ ] `can(user, action, resource)` ด้วย CASL — โครงเปล่าพอ ยังไม่ต้องมี rule ครบ
- [ ] Test: แต่ละ role ทำอะไรได้/ไม่ได้
- [ ] Test: invariant ที่ app บังคับ (DB ไม่ได้) — ต้องมีใน Phase 1:
  - [ ] org ต้องมี role='owner' ≥1 แถวเสมอ
  - [ ] project ต้องมี status.is_done_type=true ≥1 อัน
- [ ] 🔒 **`AuditService` เขียน audit row ใน transaction เดียวกับ business logic** ไม่ผ่าน event emitter ([เหตุผล](../docs/01-architecture.md#how-the-activity-log-is-written))
- [ ] `@nestjs/event-emitter` ติดตั้งไว้ใช้กับ **notification เท่านั้น**
- [ ] `AuditService` เปิด method เฉพาะ ตั้งชื่อเป็นภาษาของ audit (`getRecentActorTargets` ไม่ใช่ `getRecentAssignees`)

## 6. Service wrapper

- [ ] `EmailService` ห่อ Resend + `notify.outbox` + worker (retry 3 ครั้ง exponential backoff → mark failed + Sentry)
- [ ] `StorageService` ห่อ MinIO — bucket **private** เข้าผ่าน presigned URL เท่านั้น
- [ ] `FeatureService.can(org, feature)` — return `true` เสมอ (Phase 1 ใช้ดัก `public_registration`)
- [ ] เพิ่ม `minio` เข้า `docker-compose.yml` (volume แยกจาก DB)

## 7. Deploy — อย่าเลื่อน

- [ ] เพิ่ม `api` / `web` / `caddy` เข้า `docker-compose.yml`
- [ ] `Dockerfile` ทั้งสอง app (multi-stage)
- [ ] CI: `lint` + `check-types` + `test` + `build`
- [ ] **Deploy ขึ้น Bangmod ได้จริง แม้เป็นหน้าเปล่า**
- [ ] Sentry ทั้งสองฝั่ง
- [ ] Backup: DB กับ MinIO **แยกกัน** (ไฟล์หายกู้จาก DB ไม่ได้)
- [ ] DB user ของ app **ไม่ใช่ superuser**

> pipeline ที่ทำทีหลังมักกลายเป็นคอขวด — ข้อนี้เป็น 🔴 ทั้งที่ไม่มีฟีเจอร์ให้ดู

## 8. ปิด Phase 0

- [ ] Seed script สำหรับ dev/demo
- [ ] Seed permission key ของ RBAC ระดับระบบ (**ไม่มีโค้ดอ่าน** — back-office มา Phase 7)
- [ ] `yarn build` / `lint` / `check-types` / `test` ผ่านหมด
- [ ] Tag `v0.1.0`

---

## ดักไว้ก่อน — จุดที่เสียเวลาแน่ถ้าไม่รู้

| จุด | เรื่อง |
|---|---|
| Postgres 18 | data dir ย้ายไป subdirectory ที่มีเลขเวอร์ชัน · mount ที่ `/var/lib/postgresql` ไม่ใช่ `/var/lib/postgresql/data` (เจอมาแล้วตอนตั้ง compose) |
| Port 5432 | เครื่อง dev มี Postgres รันอยู่แล้ว → ตั้ง `POSTGRES_PORT` ใน `.env` |
| Partitioned table | PK ต้องมี partition key อยู่ด้วย → `audit.logs` เป็น composite PK |
| `SET LOCAL` | รับ parameter ไม่ได้ ถ้าต่อ string = SQL injection · ใช้ `set_config(..., $1, true)` (เรื่องของ Phase 2 แต่จำไว้) |
| `FORCE ROW LEVEL SECURITY` | `ENABLE` เฉยๆ ไม่กันเจ้าของตาราง และ**เงียบสนิทไม่มี error** (Phase 2) |
| Estimate เวลา | roadmap เขียน ~2 สัปดาห์ · ของในลิสต์นี้ทำนอกเวลาน่าจะเกิน ถ้าจะตัดให้ตัด Sentry / CI ก่อน อย่าตัด deploy กับ isolation test |
