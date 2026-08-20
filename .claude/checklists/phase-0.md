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

- [x] TypeORM 1.1 + `pg` + `@nestjs/typeorm` · naming strategy เขียนเองใน repo ไม่ใช้ `typeorm-naming-strategies`
- [x] `data-source.options.ts` (ฟังก์ชันเปล่า) แยกจาก `data-source.ts` (instance ของ CLI ที่อ่าน `process.env` ตอน import)
- [x] 🔒 **`synchronize: false` ถาวร** — ทุก migration เขียนมือ
- [x] `DATABASE_URL` เข้า zod schema (ไม่มี default) · `ConfigModule` ชี้ `.env` ที่รากของ repo
- [x] `/health/ready` มี DB indicator (**readiness เท่านั้น**) — stop postgres แล้วได้ 503 ส่วน `/health/live` ยัง 200

## 2. Migration ชุดแรก — ลำดับสำคัญ

`yarn workspace @api/core migration:create|run|revert|show` · รันกับ `dist/` ที่ `nest build` ออกมา · ตาราง `migrations` อยู่ schema `public`

- [x] `001` extension `citext` — ไม่ลง `pgcrypto` (`gen_random_uuid()` เป็นของ core ตั้งแต่ PG 13)
- [x] `002` schema ทั้ง 11 ตัว
- [x] 🔒 `003` `identity.users` + seed system user — `is_system` · `password_hash` NULL · trigger กันลบ
- [x] 🔒 `004` `audit.logs` — `PARTITION BY RANGE (occurred_at)` + **`PRIMARY KEY (id, occurred_at)`** · partition ล่วงหน้า 12 เดือน + `logs_default`
- [x] ตารางที่เหลือตาม [`02-database.md`](../docs/02-database.md#5-full-schema) ยกเว้น `chat.*` (Phase 2)
- [x] Test กัน entity หลุดจาก migration — [`test/schema-drift.spec.ts`](../../apps/api/core/test/schema-drift.spec.ts)
- [ ] Job สร้าง partition เดือนถัดไป — ฝั่ง DB พร้อมแล้ว (`audit.ensure_month_partition(date)` เรียกซ้ำได้) เหลือตัวตั้งเวลา
- [ ] Alert เมื่อ `audit.logs_default` มีแถว — แปลว่า partition ขาด และเดือนนั้นจะสร้าง partition ไม่ได้จนกว่าจะย้ายออก

> **28 ตาราง · 10 schema · 12 migration** — revert ทั้งหมดแล้วเหลือ 0 ตาราง 0 schema 0 extension · run ใหม่ได้ 28 เท่าเดิม

**ตรวจก่อนปิดข้อนี้** — รันด้วย query กับ DB จริงแล้วทุกข้อ

- [x] 🔒 ทุก column วันเวลาเป็น `timestamptz`
- [x] 🔒 ทุกตารางมี `org_id` ยกเว้น `identity`, `billing.plans`, `organization.organizations`
- [x] 🔒 unique constraint ของตารางที่ soft delete เป็น **partial index** — เหลือแต่ `UNIQUE (id, org_id)` ที่เป็นเป้าให้ลูกชี้
- [x] 🔒 `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT` — 55 FK ผ่านหมด
- [x] 🔒 `sort_order` เป็น `text COLLATE "C"`
- [x] 🔒 FK ระหว่างสองตารางที่ scope ด้วย org เป็น **composite `(fk_id, org_id)`** ([เหตุผล](../docs/02-database.md#2-foreign-key-rules))
- [x] ทุกตารางที่ soft delete มี `CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))`
- [x] ไม่มีคอลัมน์ซ้ำกับ base entity — ยกเว้น `user_roles.granted_by` (SET NULL ต่างจาก `created_by` ที่เป็น RESTRICT)
- [x] Partial unique index บังคับ "at most one" — `statuses.is_default` · `sprints.status = 'active'`
- [x] `CHECK` บนคอลัมน์ที่ partial index อ่านค่าตรง ๆ ([เหตุผล](../docs/02-database.md#check-vs-enum)) — `users` · `sprints` · `outbox` `.status`
- [x] ไม่มี `CREATE TYPE ... AS ENUM` ที่ไหนเลย
- [x] Composite index ขึ้นต้นด้วย `org_id` — ยกเว้น `outbox_pending_idx` ที่ worker ตั้งใจสแกนข้าม org
- [x] `tasks.depth` มีเพดานทั้งสองฝั่ง — CHECK ใน DB + `MAX_TASK_DEPTH` ใน `@repo/shared` · [`test/schema-invariants.spec.ts`](../../apps/api/core/test/schema-invariants.spec.ts) เช็คว่าสองฝั่งตรงกัน (เลขใน migration เขียนตรง ๆ ไม่ import — migration ที่เปลี่ยนความหมายเมื่อมีคนแก้ constant ไม่ใช่บันทึกของสิ่งที่ทำไปแล้ว)

## 3. Base entity + org scoping

- [x] `shared/base.entity.ts` — 🔒 UUID pk, `org_id`, `created_at/by`, `updated_at/by`, `deleted_at/by`
  - [x] 4 คลาสตามรูปทรงที่ schema ใช้จริง ([ตารางเทียบ](../docs/02-database.md#base-entity--on-every-table-with-three-named-exceptions)) — `BaseEntity` (ปกติ) · `SoftDeletableEntity` (ไม่มี org_id) · `OrgScopedEntity` (ไม่มี soft delete) · `TimestampedEntity` · `audit.logs` ประกาศเอง
- [x] TypeORM subscriber เติม `createdBy` / `updatedBy` / `deletedBy` จาก request context
  - [x] ไม่เดาค่าเมื่อไม่มี context — migration/job ต้องบอกเองว่าทำในนามใคร (system user มีไว้เพื่อการนี้)
- [x] `shared/request-context.ts` — `AsyncLocalStorage<{ orgId, userId }>`
- [x] ~~Guard~~ **Middleware** ใส่ค่า context ตอนต้น request
  - guard ทำไม่ได้ — มันคืน boolean แล้ว scope ของ `AsyncLocalStorage` ปิดทันที handler จะรันนอก context (พิสูจน์แล้ว) · middleware เรียก `next()` จากในนั้นได้
- [x] `OrgScopedRepository<T>` — ทุก service ใช้ตัวนี้ ห้าม inject `Repository<T>` ตรง
  - [x] `organization.organizations` scope ด้วย `id` ไม่ใช่ `org_id` (ตารางเดียวที่ต่าง)
  - [x] `where` แบบ array (= OR ใน TypeORM) ต้องใส่เงื่อนไข org ลง**ทุก branch** ไม่ใช่ใส่ข้างนอกครั้งเดียว
  - [x] `queryBuilder.withOrg()` / `queryBuilder.base()` — ไม่มีตัวไหนเป็น default ต้องเลือกทุกครั้ง
    - `withOrg` **ไม่มีอยู่** บน entity ที่ไม่มี `orgId` (identity.\*, billing.plans) — compile ไม่ผ่าน แทนที่จะพังตอน runtime
    - `withOrg` ตัด `where`/`orWhere` ออกทั้ง type และ runtime (Proxy) เพราะ `andWhere` คืน `this` ทำให้ type หลุดตอน chain
    - `base()` = `createQueryBuilder` เปล่า · ถูกต้องสำหรับตารางที่ไม่มี org_id · เป็นการข้าม org ถ้าใช้บนตารางที่มี
- [x] ESLint rule ห้าม inject `Repository<T>` ธรรมดา (เฉพาะ `src/modules/**`)
- [x] `@SkipOrgScope()` decorator สำหรับ endpoint ที่ต้องข้ามจริงๆ
- [x] 🔒 **Integration test: query จาก org A ต้องมองไม่เห็นข้อมูล org B** — [`test/org-isolation.spec.ts`](../../apps/api/core/test/org-isolation.spec.ts) 10 เคส
  - [x] โครง integration test — [`test/database.ts`](../../apps/api/core/test/database.ts) reset DB แล้วรัน migration ให้เองทุกครั้ง
- [x] Entity ครบทั้ง 28 ตาราง (ยกเว้น `chat.*` ที่เป็น Phase 2) — drift test คุมทั้ง schema แล้ว
  - เจอ 10 จุดตอนใส่ครบ **ไม่มีข้อไหนเป็นชื่อหรือ type ผิดเลย** ทั้งหมดเป็นเรื่อง `DEFAULT` ที่ entity ไม่ได้ประกาศให้ตรง
  - `jsonb` ใช้ `{ default: {} }` ไม่ใช่ `() => "'{}'::jsonb"` · คอลัมน์ที่ DB มี default ต้องประกาศฝั่ง entity ด้วย
  - `audit.logs.id` ต้องเป็น `@PrimaryGeneratedColumn('uuid')` คู่กับ `@PrimaryColumn` ของ `occurred_at` — ถ้าใส่ `@PrimaryColumn` + default เอง schema builder จะเสนอ drop-then-set วนไม่จบ

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
  - [ ] `tasks.completed_at`/`completed_by` ต้องมีค่า **ก็ต่อเมื่อ** status ของ task นั้นเป็น `is_done_type` — ข้ามตาราง CHECK ไม่ได้ · ต้องคุมทั้งตอนเปลี่ยน status ของ task และตอนแก้ `is_done_type` ของ status ที่มี task ใช้อยู่
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
| `migration:create` | ไฟล์ที่ออกมา `import { MigrationInterface, QueryRunner }` **พังใน ESM** (เป็น type ล้วน ไม่มีใน `typeorm/index.mjs`) · ผ่าน `nest build` แต่ Vitest ตาย · eslint `consistent-type-imports` เปิดเฉพาะโฟลเดอร์ `migrations/` แก้ให้ตอน commit — เปิดทั้ง repo จะไปลบ metadata ที่ NestJS DI ใช้ |
| แก้ migration ที่รันไปแล้ว | DB ที่บันทึกว่ารันแล้วจะไม่รันซ้ำ → test DB ค้างอยู่กับ schema เก่าเงียบ ๆ · `test/database.ts` เลย reset ก่อนทุกครั้ง |
| `ON DELETE SET NULL` + composite FK | ต้องระบุคอลัมน์ `SET NULL (sprint_id)` ไม่งั้น null `org_id` ไปด้วยซึ่งเป็น NOT NULL |
| `ON DELETE RESTRICT` | กันแถวที่อ้างถึงตัวเองไม่ได้ (ลบแล้วตัวอ้างหายพร้อมกัน) — system user ต้องใช้ trigger |
| `SET LOCAL` | รับ parameter ไม่ได้ ถ้าต่อ string = SQL injection · ใช้ `set_config(..., $1, true)` (เรื่องของ Phase 2 แต่จำไว้) |
| `FORCE ROW LEVEL SECURITY` | `ENABLE` เฉยๆ ไม่กันเจ้าของตาราง และ**เงียบสนิทไม่มี error** (Phase 2) |
| Estimate เวลา | roadmap เขียน ~2 สัปดาห์ · ของในลิสต์นี้ทำนอกเวลาน่าจะเกิน ถ้าจะตัดให้ตัด Sentry / CI ก่อน อย่าตัด deploy กับ isolation test |
