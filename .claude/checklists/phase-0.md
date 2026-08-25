# Phase 0 — Foundation `v0.1.0`

ไล่ตามลำดับที่ทำได้จริง (ไม่ใช่ลำดับ priority ใน [`03-roadmap.md`](../docs/03-roadmap.md)) — ข้อล่างพึ่งข้อบน

> ## ✅ Phase 0 จบแล้ว — tag `v0.1.0`
>
> เก็บไฟล์นี้ไว้เป็นบันทึกว่าทำอะไรไปบ้างและทำไม ไม่ต้องไล่ติ๊กต่อ · ข้อที่ยังว่างอยู่คือของที่ **ตั้งใจเลื่อนไป Phase 1** ไม่ใช่ของค้าง (§8 — invariant ที่ต้องมี service ก่อนถึงจะบังคับได้ · กติกาย้ายไป [`04-features.md`](../docs/04-features.md) และ [`definition-of-done.md`](./definition-of-done.md) เรียบร้อยแล้ว)
>
> **สถานะไฟล์นี้:** ไม่ใช่ spec · ตัวสเปกจริงอยู่ที่ [`.claude/docs/`](../docs/) — ถ้าขัดกัน ให้เชื่อ docs
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
- [x] ตารางที่เหลือตาม [`02-database/README.md`](../docs/02-database/schema.md) ยกเว้น `chat.*` (Phase 2) และ `identity.oauth_accounts` (Phase 1 — migrate ไว้ แต่ Google login ยังไม่เปิดใช้)
- [x] Test กัน entity หลุดจาก migration — [`test/schema-drift.spec.ts`](../../apps/api/core/test/schema-drift.spec.ts)
- [x] Job สร้าง partition เดือนถัดไป — cron `audit-partitions` 03:05 เติมให้ครบ 12 เดือนล่วงหน้าทุกวัน ([`src/maintenance/`](../../apps/api/core/src/maintenance/))
- [x] Alert เมื่อ `audit.logs_default` มีแถว — `alerts.condition()` เข้า Sentry แล้ว (§7 ทำไปแล้ว) · log บรรทัดเดิมยังอยู่

> **28 ตาราง · 10 schema · 12 migration (+1 seed)** — revert ทั้งหมดแล้วเหลือ 0 ตาราง 0 schema 0 extension · run ใหม่ได้ 28 เท่าเดิม · `02-database/README.md` ระบุ 29 ตาราง ส่วนที่ต่างคือ `identity.oauth_accounts` ที่ตั้งใจเลื่อนไป Phase 1

**ตรวจก่อนปิดข้อนี้** — รันด้วย query กับ DB จริงแล้วทุกข้อ

- [x] 🔒 ทุก column วันเวลาเป็น `timestamptz`
- [x] 🔒 ทุกตารางมี `org_id` ยกเว้น `identity`, `billing.plans`, `organization.organizations`
- [x] 🔒 unique constraint ของตารางที่ soft delete เป็น **partial index** — เหลือแต่ `UNIQUE (id, org_id)` ที่เป็นเป้าให้ลูกชี้
- [x] 🔒 `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT` — 55 FK ผ่านหมด
- [x] 🔒 `sort_order` เป็น `text COLLATE "C"`
- [x] 🔒 FK ระหว่างสองตารางที่ scope ด้วย org เป็น **composite `(fk_id, org_id)`** ([เหตุผล](../docs/02-database/rules.md#foreign-key-rules))
- [x] ทุกตารางที่ soft delete มี `CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))`
- [x] ไม่มีคอลัมน์ซ้ำกับ base entity — ยกเว้น `user_roles.granted_by` (SET NULL ต่างจาก `created_by` ที่เป็น RESTRICT)
- [x] Partial unique index บังคับ "at most one" — `statuses.is_default` · `sprints.status = 'active'`
- [x] `CHECK` บนคอลัมน์ที่ partial index อ่านค่าตรง ๆ ([เหตุผล](../docs/02-database/README.md#check-vs-enum)) — `users` · `sprints` · `outbox` `.status`
- [x] ไม่มี `CREATE TYPE ... AS ENUM` ที่ไหนเลย
- [x] Composite index ขึ้นต้นด้วย `org_id` — ยกเว้น `outbox_pending_idx` ที่ worker ตั้งใจสแกนข้าม org
- [x] `tasks.depth` มีเพดานทั้งสองฝั่ง — CHECK ใน DB + `MAX_TASK_DEPTH` ใน `@repo/shared` · [`test/schema-invariants.spec.ts`](../../apps/api/core/test/schema-invariants.spec.ts) เช็คว่าสองฝั่งตรงกัน (เลขใน migration เขียนตรง ๆ ไม่ import — migration ที่เปลี่ยนความหมายเมื่อมีคนแก้ constant ไม่ใช่บันทึกของสิ่งที่ทำไปแล้ว)

## 3. Base entity + org scoping

- [x] `shared/base.entity.ts` — 🔒 UUID pk, `org_id`, `created_at/by`, `updated_at/by`, `deleted_at/by`
  - [x] 4 คลาสตามรูปทรงที่ schema ใช้จริง ([ตารางเทียบ](../docs/02-database/rules.md#base-entity)) — `BaseEntity` (ปกติ) · `SoftDeletableEntity` (ไม่มี org_id) · `OrgScopedEntity` (ไม่มี soft delete) · `TimestampedEntity` · `audit.logs` ประกาศเอง
- [x] TypeORM subscriber เติม `createdBy` / `updatedBy` / `deletedBy` จาก request context
  - [x] ไม่เดาค่าเมื่อไม่มี context — migration/job ต้องบอกเองว่าทำในนามใคร (system user มีไว้เพื่อการนี้)
- [x] `shared/request-context.ts` — `AsyncLocalStorage<{ orgId, userId }>`
- [x] **Middleware** ใส่ค่า context ตอนต้น request (Phase 1 ให้ `AuthGuard` รับช่วง)
  - ที่ guard ทำไม่ได้คือ `run()` — มันคืน boolean แล้ว scope ปิดก่อน handler รัน (พิสูจน์แล้ว) · middleware เรียก `next()` จากในนั้นได้
  - แต่ `enterWith()` ทำได้ และวัดแล้วว่าอยู่รอดข้าม `await` และแยกกันจริงตอน request ชนกัน — auth จึงไปอยู่ที่ guard เพราะมีแต่ guard ที่เห็น `@Public()` ([รายละเอียด](../docs/01-architecture.md#auth))
- [x] `OrgScopedRepository<T>` — ทุก service ใช้ตัวนี้ ห้าม inject `Repository<T>` ตรง
  - [x] `organization.organizations` scope ด้วย `id` ไม่ใช่ `org_id` (ตารางเดียวที่ต่าง)
  - [x] `where` แบบ array (= OR ใน TypeORM) ต้องใส่เงื่อนไข org ลง**ทุก branch** ไม่ใช่ใส่ข้างนอกครั้งเดียว
  - [x] `queryBuilder.withOrg()` / `queryBuilder.base()` — ไม่มีตัวไหนเป็น default ต้องเลือกทุกครั้ง
    - `withOrg` **ไม่มีอยู่** บน entity ที่ไม่มี `orgId` (identity.\*, billing.plans) — compile ไม่ผ่าน แทนที่จะพังตอน runtime
    - `withOrg` ตัด `where`/`orWhere` ออกทั้ง type และ runtime (Proxy) เพราะ `andWhere` คืน `this` ทำให้ type หลุดตอน chain
    - `base()` = `createQueryBuilder` เปล่า · ถูกต้องสำหรับตารางที่ไม่มี org_id · เป็นการข้าม org ถ้าใช้บนตารางที่มี
- [x] ESLint rule ห้าม inject `Repository<T>` ธรรมดา (เฉพาะ `src/modules/**`)
- [x] `@SkipOrgScope()` decorator สำหรับ endpoint ที่ต้องข้ามจริงๆ
- [x] 🔒 **Integration test: query จาก org A ต้องมองไม่เห็นข้อมูล org B** — [`test/org-isolation.spec.ts`](../../apps/api/core/test/org-isolation.spec.ts)
  - [x] โครง integration test — [`test/database.ts`](../../apps/api/core/test/database.ts) reset DB แล้วรัน migration ให้เองทุกครั้ง
- [x] Entity ครบทั้ง 28 ตาราง (ยกเว้น `chat.*` = Phase 2 และ `identity.oauth_accounts` = Phase 1) — drift test คุมทั้ง schema แล้ว
  - เจอ 10 จุดตอนใส่ครบ **ไม่มีข้อไหนเป็นชื่อหรือ type ผิดเลย** ทั้งหมดเป็นเรื่อง `DEFAULT` ที่ entity ไม่ได้ประกาศให้ตรง
  - `jsonb` ใช้ `{ default: {} }` ไม่ใช่ `() => "'{}'::jsonb"` · คอลัมน์ที่ DB มี default ต้องประกาศฝั่ง entity ด้วย
  - `audit.logs.id` ต้องเป็น `@PrimaryGeneratedColumn('uuid')` คู่กับ `@PrimaryColumn` ของ `occurred_at` — ถ้าใส่ `@PrimaryColumn` + default เอง schema builder จะเสนอ drop-then-set วนไม่จบ

> ❓ RLS **ไม่ทำใน phase นี้** — เลื่อนไป Phase 2 พร้อมเรื่อง transaction strategy

## 4. Soft delete + retention

- [x] `@DeleteDateColumn` — TypeORM กรอง `deleted_at IS NULL` ให้อัตโนมัติ
- [x] วัดจริงว่าครอบคลุมแค่ไหน ([ตาราง](../docs/01-architecture.md#soft-delete)) — **QueryBuilder กรองให้ด้วย** ตรงข้ามกับที่ doc เดิมเขียนไว้ · ที่ไม่กรองคือ `update()` กับ raw SQL
  - `softDeleteById` เลยต้องเติม `deletedAt: IsNull()` เอง ไม่งั้นลบซ้ำได้ เขียนทับว่าใครลบ และนับ 90 วันใหม่
- [x] Cascade soft delete — [`shared/entity/cascade-soft-delete.ts`](../../apps/api/core/src/shared/entity/cascade-soft-delete.ts) เดินลงใน transaction เดียว
  - ข้อนี้คือสิ่งที่กัน retention ไม่ให้ติด — project ที่ soft delete แล้วแต่ task ยังอยู่ ลบไม่ออกเพราะ `tasks.project_id` เป็น RESTRICT · มี test พิสูจน์ครบวง cascade → purge
  - แผนที่ `AGGREGATE_CHILDREN` เขียนมือ **ไม่ได้อ่านจาก `pg_constraint`** เหมือน retention — DB ตอบไม่ได้ว่าอะไรเป็นของอะไร (RESTRICT ไม่ได้แปลว่าไม่ใช่ลูก, NOT NULL ไม่ได้แปลว่าใช่)
  - Test บังคับว่าทุกตารางที่ soft delete ได้ ต้องอยู่ใน `AGGREGATE_CHILDREN` หรือ `ROOTS` — ตารางใหม่ที่ลืมใส่ fail ทันที
- [x] Test — [`test/cascade-soft-delete.spec.ts`](../../apps/api/core/test/cascade-soft-delete.spec.ts)

**Retention job** — ครบทั้ง 5 นโยบายใน [`01-architecture.md`](../docs/01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime) แล้ว อยู่ที่ [`src/maintenance/`](../../apps/api/core/src/maintenance/)

- [x] cron `retention` 03:15 (`Asia/Bangkok`) — soft-deleted 90 วัน · `pending_deletion` 30 วัน · outbox 30 วัน · session 7 วัน · reset token 1 วัน
- [x] ลำดับการลบคำนวณจาก `pg_constraint` ตอนรัน ไม่ใช่ลิสต์เขียนมือ — ตารางใหม่เข้า sweep เองอัตโนมัติ
- [x] `identity.users` อยู่ใน `NEVER_PURGED` — anonymize อย่างเดียว ไม่ hard delete
- [x] `pg_try_advisory_lock` กันสอง instance ยิงพร้อมกัน · `JOBS_ENABLED=false` ปิดได้ทั้งโปรเซส
- [x] `SYSTEM_USER_ID` ย้ายมาที่ [`src/shared/system-user.ts`](../../apps/api/core/src/shared/system-user.ts) — job ไม่มี request context ต้องบอกเองว่าเขียนในนามใคร · [`test/schema-invariants.spec.ts`](../../apps/api/core/test/schema-invariants.spec.ts) เช็คว่าตรงกับ uuid ที่ migration seed ไว้
- [x] Test — [`test/retention.spec.ts`](../../apps/api/core/test/retention.spec.ts) — รวมเคสที่ลบไม่ผ่านแล้วต้องข้ามไม่ล้มทั้ง sweep
- [x] ย้าย alert (`audit.logs_default`, retention step ที่ fail) จาก log ไป Sentry — `src/shared/alert.ts` (ย้ายออกจาก `maintenance/` ตอน `OutboxWorker` ต้องใช้ด้วย)
      · log บรรทัดเดิมยังอยู่ (ไว้อ่านตอนเปิดดูอยู่แล้ว) Sentry คือตัวที่มาตามให้ไปดู · ไม่มี DSN = เงียบ

## 5. Permission + Activity log

- [x] 🔒 **`AuditService` เขียน audit row ใน transaction เดียวกับ business logic** ไม่ผ่าน event emitter ([เหตุผล](../docs/01-architecture.md#how-the-activity-log-is-written))
  - `record(manager, entry)` รับ `EntityManager` ของ transaction เข้ามา และ **throw ถ้า transaction ไม่ได้เปิดอยู่** — ทำให้ทางที่ผิด (เขียนจาก event listener) พังเสียงดังแทนที่จะเงียบ
  - `org_id` / `actor_id` มาจาก request context ไม่ใช่จาก argument เหมือนทุก write ในระบบ
  - Test: business logic throw → ทั้ง row งานและ audit row หายไปด้วยกัน
- [x] `@nestjs/event-emitter` ติดตั้งไว้ใช้กับ **notification เท่านั้น** — เขียนเหตุผลไว้ที่ `EventEmitterModule.forRoot()` ใน `app.module.ts`
- [x] `AuditService` เปิด method เฉพาะ ตั้งชื่อเป็นภาษาของ audit — `findRecentTargets` / `findForEntity` ไม่ใช่ `getRecentAssignees`
- [x] `can(user, action, resource)` ด้วย CASL — [`src/permission/`](../../apps/api/core/src/permission/) โครงเปล่าตามที่ตั้งใจ มีแค่ลำดับชั้น role ที่ spec ฟิกไว้แล้ว ยังไม่มี rule ราย feature
  - **`resource` เป็น parameter บังคับ** — CASL ตอบ `can('delete','Project')` ที่ไม่ส่ง resource ว่า "ทำกับ*บางอัน*ได้ไหม" ซึ่ง project admin ได้ `true` ทั้งที่ลบได้แค่ project ตัวเอง · หน้าตาเหมือน check ที่ผ่าน · บังคับให้ส่งแปลว่าเขียนแบบอันตรายแล้ว **compile ไม่ผ่าน** ไม่ใช่แค่มีคอมเมนต์เตือน
  - ส่ง `{}` ได้เมื่อไม่มี row ให้อ้าง (เช่น `create Project`) — CASL fail ทุก rule ที่มีเงื่อนไข ซึ่งเป็นทางที่ปลอดภัย
  - `isEverAllowedTo()` คือคำถาม "ทำกับบางอันได้ไหม" ที่ตั้งใจถาม — ใช้ตัดสินว่าจะโชว์ปุ่มไหม ไม่ใช่ตัดสินสิทธิ์
- [x] Test: แต่ละ role ทำอะไรได้/ไม่ได้ — [`permission.service.spec.ts`](../../apps/api/core/src/permission/permission.service.spec.ts) (unit ไม่ต้องมี DB)
- [x] `provideOrgRepository()` / `@InjectOrgRepository()` — วิธีที่ module ต่อกับตารางของตัวเอง โดยไม่ต้องแตะ `@InjectRepository` ที่ ESLint ห้ามไว้ · `audit/` เป็นตัวอย่างแรก
- [ ] Test: invariant ที่ app บังคับ (DB ไม่ได้) — **เลื่อนไป Phase 1 ตามที่ระบุไว้แต่แรก** เพราะยังไม่มี service ให้บังคับ:
  - [ ] org ต้องมี role='owner' ≥1 แถวเสมอ
  - [ ] project ต้องมี status.is_done_type=true ≥1 อัน
  - [ ] `tasks.completed_at`/`completed_by` ต้องมีค่า **ก็ต่อเมื่อ** status ของ task นั้นเป็น `is_done_type` — ข้ามตาราง CHECK ไม่ได้ · ต้องคุมทั้งตอนเปลี่ยน status ของ task และตอนแก้ `is_done_type` ของ status ที่มี task ใช้อยู่

## 6. Service wrapper

- [x] `EmailService` ห่อ Resend + `notify.outbox` + worker — [`src/modules/notify/`](../../apps/api/core/src/modules/notify/)
  - `enqueue(manager, notification)` รับ `EntityManager` แล้ว throw ถ้าไม่มี transaction เหมือน `AuditService` · เหตุผลอ่อนกว่านิดหน่อย (อีเมลที่ส่งไปแล้วเรียกคืนไม่ได้ ส่วนอีเมลที่มาช้ายังโอเค) แต่รูปเดียวกัน
  - Worker พยายาม 3 ครั้ง — ครั้งแรกทันที แล้ว +5 นาที แล้ว +25 นาที (3 ครั้ง = 2 ช่องว่าง) → `status='failed'` แล้วหยุด · `failed` ไม่มีใคร retry ต่อ จึงยิง Sentry ด้วย ไม่ใช่แค่ log `error`
  - `FOR UPDATE SKIP LOCKED` + advisory lock — at-least-once โดยตั้งใจ · process ตายกลางคันแล้วส่งซ้ำ ดีกว่า mark sent ก่อนส่งแล้วหาย
  - Template ที่ยังไม่มีคน implement **ไม่ throw** — ส่งแบบดิบไปก่อน ไม่งั้นจะวนอยู่ใน retry loop จนถูก mark failed
  - Test — [`test/outbox.spec.ts`](../../apps/api/core/test/outbox.spec.ts)
- [x] `StorageService` ห่อ **Garage** (S3) — bucket **private** เข้าผ่าน presigned URL เท่านั้น · [ทำไมไม่ใช่ MinIO](../docs/01-architecture.md#object-storage)
  - storage ล่มแล้ว API ยัง boot ได้ · `/health/ready` เป็น 503 พร้อมบอกว่า storage down ส่วน `/health/live` ยัง 200 (ทดสอบจริงแล้ว)
  - `RESEND_API_KEY` เป็น optional — ไม่ตั้ง = เขียนลง log · แต่ `NODE_ENV=production` แล้วไม่ตั้ง = **boot ไม่ผ่าน** ไม่งั้น notification ของจริงจะหายลง stdout
- [x] `FeatureService.isEnabled(org, feature)` ([`src/feature/`](../../apps/api/core/src/feature/)) — Phase 0 ทำเป็น `return true` เสมอ · **Phase 1 เปลี่ยนเป็น allow-list ว่าง** ดู [`phase-1.md`](./phase-1.md) §0
- [x] เพิ่ม `garage` + `garage-init` เข้า `docker-compose.yml` (volume แยกจาก DB — ไฟล์กู้จาก DB backup ไม่ได้ ต้อง restore แยกกันได้)
  - Garage image ไม่มี shell เลย (เหตุผลที่มันแค่ 66MB) · init เลยเป็น container แยกที่คุยผ่าน Admin API ด้วย curl
  - init รันซ้ำได้ ทดสอบแล้ว — layout ข้ามถ้ามีแล้ว ส่วน key/bucket ตอบ 409 แล้วปล่อยผ่าน
  - `garage-ui` ขึ้นพร้อม `docker compose up -d` ที่ port 4909 — Garage ไม่มี UI ในตัว ([ตัวไหนใช้ได้บ้าง](../docs/01-architecture.md#object-storage)) · ถือ admin token จึง bind `127.0.0.1` เท่านั้น และไม่มีใน `deploy/compose.yml`

## 7. Deploy — อย่าเลื่อน

- [x] เพิ่ม `api` / `web` / `caddy` — อยู่ใน `deploy/compose.yml` แยกไฟล์
- [x] แยก service ตอน dev ออกจากชุดที่ deploy · เป็นคนละไฟล์ ไม่ใช่ override เพราะ
      compose เพิ่ม service ได้แต่ลบไม่ได้ · `postgres-test` กับ `garage-ui` ไม่มีในไฟล์ prod
- [x] `Dockerfile` ทั้งสอง app (multi-stage) · api 275 MB · web 201 MB (standalone)
- [x] CI: `lint` + `check-types` + `test` + `build` + build image ทั้งสองตัว
- [x] **Deploy ขึ้น Bangmod** — ของฝั่ง repo เสร็จและส่งมอบแล้ว · **ตัวรันจริงบนเครื่องเป็นงานของ owner**
      บรรทัดนี้ติ๊กเพราะสิ่งที่ repo ทำได้ทำครบแล้ว ไม่ได้แปลว่า Bangmod ขึ้นแล้ว — ดูของจริงที่ Actions
      - pipeline: `deploy.yml` → push image ขึ้น GHCR + ssh ไป `pull`/`up -d`
      - ไฟล์ใน `deploy/` copy เอง (`rsync -a --exclude docs`) · ทุก deploy เทียบ `checksum.sh` ก่อนแตะอะไร
        ไม่ตรงคือ **fail** ไม่ใช่เตือน — กัน server รัน Caddyfile เก่าแบบเงียบ ๆ
      - runbook 9 step ที่ [`deploy/docs/setup.md`](../../deploy/docs/setup.md) · key ที่ [`ssh-keys.md`](../../deploy/docs/ssh-keys.md)
      - ทดสอบบนเครื่องครบ: boot จากศูนย์ → migrate → serve ผ่าน Caddy → redeploy ซ้ำ → rollback ด้วย IMAGE_TAG
      - เหลือฝั่ง owner: secret `SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`/`DEPLOY_PATH` (= `/srv/taskflow/deploy`),
        var `NEXT_PUBLIC_SENTRY_DSN`, `docker login ghcr.io` บนเครื่อง, rsync รอบแรก, เปิด branch protection ให้ CODEOWNERS มีผล
        (GHCR package private โดย default · pull ไม่ผ่านขึ้นว่า "not found" ไม่ใช่ 403 · รอบแรกต้องให้ CI build ก่อนเพราะ server ไม่มี source)
- [x] Sentry ทั้งสองฝั่ง · ไม่มี DSN = เงียบ · production ไม่มี DSN = ไม่ boot
- [x] Backup: `deploy/backup.sh` แยก DB กับ object · restore กลับเข้า DB เปล่าแล้ว ผ่าน
- [x] DB user ของ app **ไม่ใช่ superuser** · `deploy/init/postgres.sh` · ยืนยันด้วย pg_roles

> pipeline ที่ทำทีหลังมักกลายเป็นคอขวด — ข้อนี้เป็น 🔴 ทั้งที่ไม่มีฟีเจอร์ให้ดู

## 8. ปิด Phase 0

- [x] Seed script สำหรับ dev/demo — `yarn workspace @api/core db:seed` ([`src/database/seed.ts`](../../apps/api/core/src/database/seed.ts))
      1 org · 4 คน (owner/admin/member×2) · team · project ที่มี status ครบชุด + sprint active · task 3 + sub-task 2
      รันซ้ำได้ (ลบของเดิมก่อน) · `NODE_ENV=production` แล้วปฏิเสธ exit 1
- [x] Seed permission key ของ RBAC ระดับระบบ (**ไม่มีโค้ดอ่าน** — back-office มา Phase 7)
      `SYSTEM_PERMISSIONS` ใน [`src/permission/system-permissions.ts`](../../apps/api/core/src/permission/system-permissions.ts)
      · migration เขียน key เป็น literal (เหตุผลเดียวกับ `SYSTEM_USER_ID`) · `schema-invariants.spec.ts` จับ drift
      · **ไม่ seed role กับ mapping** เพราะ spec ตั้งใจให้แก้ใน DB ได้โดยไม่ต้อง deploy
- [x] `yarn build` / `lint` / `check-types` / `test` ผ่านหมด — 150 tests / 21 files
- [x] Tag `v0.1.0` — ติดแล้ว
      เดิมเขียนไว้ว่า "owner ติดเองหลัง Bangmod ขึ้นจริง · ติดก่อนแล้วต้องย้ายทีหลัง แพงกว่าติดช้า"
      **เปลี่ยนเป็นติดก่อน deploy** เพราะแยก deploy ออกเป็นงานต่างหาก — tag นี้ประกาศว่า
      *โค้ด* พร้อม ไม่ได้ประกาศว่าเครื่องที่ Bangmod ขึ้นแล้ว · ถ้า deploy จริงแล้วต้องแก้โค้ด
      ก็ออก `v0.1.1` ไม่ต้องย้าย tag เดิม ซึ่งถูกกว่าการย้ายอยู่ดี

---

## ดักไว้ก่อน — จุดที่เสียเวลาแน่ถ้าไม่รู้

| จุด | เรื่อง |
|---|---|
| Postgres 18 | data dir ย้ายไป subdirectory ที่มีเลขเวอร์ชัน · mount ที่ `/var/lib/postgresql` ไม่ใช่ `/var/lib/postgresql/data` (เจอมาแล้วตอนตั้ง compose) |
| Port 5432 | เครื่อง dev มี Postgres รันอยู่แล้ว → ตั้ง `POSTGRES_PORT` ใน `.env` |
| Port 9000/9001 | เรื่องเดียวกัน MinIO ของโปรเจกต์อื่นจองไว้แล้ว · อาการคือ `S3Error: signature does not match` ไม่ใช่ connection refused เพราะมีตัวจริงตอบอยู่ แค่คนละ instance (เจอมาแล้วตอนยังใช้ MinIO · Garage เลย publish ที่ 4900 แทน) |
| S3 region | Garage default `garage` · AWS SDK default `us-east-1` · ไม่ตรงกัน = `Authorization header malformed` ทุกคำสั่ง ซึ่งอ่านแล้วเหมือนปัญหา credential |
| AWS SDK v3 checksum | ใส่ CRC32 ให้ทุก upload อัตโนมัติ → presigned PUT พังด้วย `InvalidDigest` เพราะ browser ไม่ได้ส่ง header นั้น → `requestChecksumCalculation: 'WHEN_REQUIRED'` |
| Garage image | ไม่มี shell ไม่มี netstat อะไรเลย มีแต่ binary · script ทุกอย่างต้องทำผ่าน Admin API จาก container อื่น |
| Partitioned table | PK ต้องมี partition key อยู่ด้วย → `audit.logs` เป็น composite PK |
| `NEXT_PUBLIC_*` | Next ฝังตอน **build** ไม่ได้อ่านตอน container start · ตั้งใน `environment:` ของ compose = ไม่ถึง browser แบบเงียบ ๆ ต้องส่งเป็น `build.args` |
| `compose up --wait` | คืน exit 1 ถ้ามี service ในชุดนั้น **stop** แม้จะ exit 0 · one-shot อย่าง `garage-init` ต้องไม่อยู่ในชุดที่ `--wait` |
| `build` ผ่าน แต่ `check-types` แดง | `tsconfig.build.json` exclude `test/` ออก · โค้ดใน test พังแบบที่ `nest build` ไม่มีวันเห็น — ต้องรันทั้งสองคำสั่ง |
| GHCR | package เป็น private โดย default · pull โดยไม่มีสิทธิ์ตอบ **"not found"** ไม่ใช่ 403 → เช็ค `docker login` ก่อนเช็ค tag |
| `migration:create` | ไฟล์ที่ออกมา `import { MigrationInterface, QueryRunner }` **พังใน ESM** (เป็น type ล้วน ไม่มีใน `typeorm/index.mjs`) · ผ่าน `nest build` แต่ Vitest ตาย · eslint `consistent-type-imports` เปิดเฉพาะโฟลเดอร์ `migrations/` แก้ให้ตอน commit — เปิดทั้ง repo จะไปลบ metadata ที่ NestJS DI ใช้ |
| แก้ migration ที่รันไปแล้ว | DB ที่บันทึกว่ารันแล้วจะไม่รันซ้ำ → test DB ค้างอยู่กับ schema เก่าเงียบ ๆ · `test/database.ts` เลย reset ก่อนทุกครั้ง |
| `ON DELETE SET NULL` + composite FK | ต้องระบุคอลัมน์ `SET NULL (sprint_id)` ไม่งั้น null `org_id` ไปด้วยซึ่งเป็น NOT NULL |
| `ON DELETE RESTRICT` | กันแถวที่อ้างถึงตัวเองไม่ได้ (ลบแล้วตัวอ้างหายพร้อมกัน) — system user ต้องใช้ trigger |
| `SET LOCAL` | รับ parameter ไม่ได้ ถ้าต่อ string = SQL injection · ใช้ `set_config(..., $1, true)` (เรื่องของ Phase 2 แต่จำไว้) |
| `FORCE ROW LEVEL SECURITY` | `ENABLE` เฉยๆ ไม่กันเจ้าของตาราง และ**เงียบสนิทไม่มี error** (Phase 2) |
| Estimate เวลา | roadmap เขียน ~2 สัปดาห์ · ของในลิสต์นี้ทำนอกเวลาน่าจะเกิน ถ้าจะตัดให้ตัด Sentry / CI ก่อน อย่าตัด deploy กับ isolation test |
