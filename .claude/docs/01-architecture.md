# Architecture

Stack, การแบ่ง module, และ convention ที่ทุก module ต้องใช้เหมือนกัน

> [← Overview](./00-overview.md) · เกี่ยวข้อง: [`02-database/README.md`](./02-database/README.md)

## Contents

1. [Tech Stack](#1-tech-stack)
2. [Modular Monolith](#2-modular-monolith)
3. [Conventions](#conventions) — [API](#api) · [Naming](#naming) · [Permission Hierarchy](#permission-hierarchy) · [Data Types](#data-types) 🔒 · [Implementation Notes](#implementation-notes) · [Auth](#auth) · [CSRF](#csrf) · [Web transport](#web-transport--ยิง-api-จากฝั่งไหนก็ได้-แต่ไม่เท่ากัน)

ดูเพิ่ม: [docker-compose](#docker-compose) · [Deploy](#deploy)

---

## 1. Tech Stack

| ส่วน            | เลือกใช้                                                            |
| -------------- | ----------------------------------------------------------------- |
| Architecture   | Modular Monolith                                                  |
| Repo           | Monorepo (Yarn 4 Berry workspace + Turborepo)                     |
| Backend        | NestJS + TypeORM                                                  |
| Frontend       | Next.js 16 + TanStack Query + `@repo/ui` (`@base-ui/react` + CVA) |
| Validation     | Zod (`packages/shared` ใช้ร่วมสองฝั่ง)                                |
| Auth           | JWT + refresh token                                               |
| Database       | PostgreSQL (แยก schema ตาม module)                                |
| Storage        | Garage (S3-compatible) — [ทำไมไม่ใช่ MinIO](#object-storage)         |
| Deploy         | Docker + Caddy บน Bangmod                                         |
| Error tracking | Sentry                                                            |

**ORM ไม่เปลี่ยน** — ประเมิน Prisma / Kysely / ts-rest แล้วเมื่อ 2026-08-30 และ **ไม่เอา**
· TypeORM ถือ decorator metadata ที่ทั้ง DI ของ Nest และ entity อาศัยอยู่ และ migration
ทุกไฟล์เป็น SQL เขียนมือซึ่งย้าย ORM แล้วก็ยังเป็นแบบเดิม — สิ่งที่ได้จึงไม่คุ้มกับการรื้อ
`OrgScopedRepository` ทั้งชั้น · อย่าเสนอซ้ำโดยไม่มีข้อมูลใหม่

### Repo Layout

```
apps/
  api/core/       NestJS          (@api/core)
  web/client/     Next.js 16      (@web/client)     · www.domain.com
  web/backoffice/ Next.js 16      (@web/backoffice) · admin.otherdomain.com  (Phase 7)
packages/
  shared/       zod schema + types + enums + constants   (@repo/shared)
  ui/           component library on @base-ui/react      (@repo/ui)
  config/       eslint, tsconfig, prettier               (@repo/config)
```

> apps อยู่ลึกกว่าปกติหนึ่งชั้น (`apps/api/core` ไม่ใช่ `apps/api`) เพื่อเผื่อ app พี่น้องใต้ domain เดียวกันทีหลัง เช่น `apps/api/worker`

> `packages/shared` ต้องไม่ import อะไรจาก TypeORM, NestJS, React หรือ Next — เก็บแค่ zod กับ plain type เท่านั้น
>
> บังคับด้วย `no-restricted-imports` ใน `packages/shared/eslint.config.mjs` แล้ว ไม่ต้องพึ่งความจำ
>
> `@repo/shared` มี build step (`tsc` → `dist/`) เพราะ NestJS คอมไพล์ด้วย tsc และ consume `.ts` ดิบจาก workspace ไม่ได้แบบที่ Next ทำได้

### docker-compose

**สองไฟล์ ไม่ใช่ override** — compose เพิ่ม service ได้แต่ลบไม่ได้ และไฟล์ dev มีสองตัวที่ห้ามขึ้น server คือ `postgres-test` (truncate table) กับ `garage-ui` (ถือ admin token)

| `docker-compose.yml` (dev) | `deploy/compose.yml` (Bangmod) |
| --- | --- |
| `postgres` `postgres-test` `garage` `garage-init` `garage-ui` | `postgres` `garage` `garage-init` `api-migrate` `api` `web` `caddy` (+ `backoffice` ตอน Phase 7) |
| publish port ออกมาหมด (4xxx / 54xx) | มีแค่ `caddy` ที่ publish |
| ต่อ DB ด้วย superuser ของ image | ต่อด้วย role ที่ `deploy/init/postgres.sh` สร้าง ไม่ใช่ superuser |

### Branching

`feat/xxx` → `main` → `prod` — ไหลทางเดียว ไม่มีทางที่ `prod` มีของที่ `main` ไม่มี

- **`main` เขียวเสมอ** เข้าได้ทาง PR อย่างเดียว · ต้องตั้ง branch protection บังคับ PR + CI เขียว ไม่งั้น "เขียวเสมอ" เป็นแค่ความตั้งใจ ไม่ใช่คุณสมบัติ
- **`prod` = ของที่อยู่บนเครื่องจริง** · merge `main` → `prod` คือการ ship — ที่แยกสอง branch เพราะต้องการแยก "โค้ดพร้อม" ออกจาก "ตัดสินใจปล่อย" งานเข้า `main` ได้เรื่อย ๆ แล้วเลือกปล่อยเป็นก้อนตอนที่พร้อม
- **branch ย่อยใช้ prefix ตาม type ของ Conventional Commits** — `feat/` `fix/` `chore/` · อายุสั้น ตัดจาก `main` เสมอ
- ❌ **ไม่มี `dev`** — branch รวมงานคุ้มก็ต่อเมื่อ**มีอะไร deploy ออกจากมัน** (staging ที่คนกดลองได้จริง) · ที่นี่ยังไม่มีเครื่องนั้น `dev` จึงเป็นแค่ที่พักคอมมิตก่อน merge อีกรอบ โดยไม่มีการตรวจอะไรเพิ่มเกิดขึ้นตรงนั้นเลย — จ่ายค่า merge และแก้ conflict สองรอบ แลกกับสัญญาณเพิ่มศูนย์ · ที่กลัวว่าหลายคนทำพร้อมกันจะชนกัน conflict เกิดตอน PR อยู่ดีไม่ว่าปลายทางเป็น branch ไหน · **มี staging server เมื่อไหร่ค่อยกลับมาคิดใหม่** วันนั้น `dev` → staging มีความหมายทันที
- **tag ไม่ใช่ตัวสั่ง deploy** — `prod` ขยับทุกครั้งที่ปล่อย ส่วน tag เป็นหมุดหมายของ phase ขยับนาน ๆ ที · สอง cadence นี้ต่างกันมาก ผูกรวมกันแล้วจะได้อย่างใดอย่างหนึ่ง คือ tag รกเพราะ deploy ทุกครั้ง หรือ deploy น้อยเพราะไม่อยากให้ tag รก
- **hotfix ผ่าน `main` เหมือนกรณีปกติ** — `fix/xxx` → `main` → `prod` · cherry-pick เข้า `prod` ตรง ๆ เป็นทางออกตอน `main` ค้างอยู่เท่านั้น อย่าให้ทางลัดกลายเป็นทางปกติ แล้วต้องย้อนกลับเข้า `main` ให้ครบทีหลัง

### Deploy

- **`deploy/` คือทุกอย่างที่อยู่บน server** — `compose.yml` + ไฟล์ที่มัน bind mount + `.env` ที่สร้างเองในนั้น · copy โฟลเดอร์นี้ไปโฟลเดอร์เดียวจบ ไม่ต้องมี source เลยเพราะแอปมาเป็น image · ไฟล์ในนั้น commit ได้หมด ไม่มีความลับ ทุกค่าเป็น `${...}` — ยกเว้น `.env` ที่ gitignore กันไว้
- **`prod` เป็น release gate** — merge `main` → `prod` คือการ ship · gate ทั้งสี่รันบน `main` ไปแล้ว `deploy.yml` เลยไม่รัน test ซ้ำ
- **image build ที่ CI ไม่ใช่ที่ server** — push ขึ้น GHCR แล้ว server แค่ `pull` + `up -d` · service ทั้งสามประกาศทั้ง `image:` และ `build:` บนเครื่อง dev เลยยัง `up -d --build` ได้
- **tag ด้วย commit SHA คู่กับ `latest`** — `latest` อย่างเดียวไม่มีอะไรให้ถอยกลับ · rollback = ตั้ง `IMAGE_TAG` เป็น sha เก่าแล้ว pull
- **migration เป็น container แยก** (`api-migrate`) รันจบก่อน `api` ขึ้น เหตุผลเดียวกับที่ `migrationsRun` เป็น false — สอง instance ที่ start พร้อมกันจะแย่งกันทำ DDL
- **Caddy รับ origin เดียว** `/api/*` → Nest (ตัด prefix), ที่เหลือ → Next · เป็นเหตุผลที่ `SameSite=Lax` พอโดยไม่ต้องมี CSRF token ([CSRF](#csrf))
- **backup แยก DB กับ object** (`deploy/backup.sh`) — ไฟล์กู้จาก DB dump ไม่ได้ · object เก็บเป็นไฟล์ธรรมดา ไม่ใช่ data dir ของ Garage เพื่อให้ restore ได้โดยไม่ต้องมี Garage
- **Sentry บังคับใน production** เหมือน `RESEND_API_KEY` — ไม่มี DSN แล้ว boot ไม่ผ่าน · deployment ที่ไม่ส่ง error ไปไหนคือความพังที่ไม่มีใครรู้
- **`./instrument` ต้องเป็น import แรกของ `main.ts`** — Sentry patch module ตอนโหลด ของที่ import ก่อนหน้ามันจะไม่ถูก instrument เลย · คอมเมนต์อย่างเดียวไม่พอ เพราะ auto-import ของ IDE ลงบรรทัด 1 เสมอ และ prettier ปล่อยไว้ (side-effect import เป็น barrier: ไม่ย้ายมันลง แต่ก็ไม่ย้ายของที่มาอยู่ข้างบนออก) · คุมสองชั้น — `importOrderSafeSideEffects` ใน `prettier/index.js` ดันมันกลับขึ้นบนตอน commit และ `test/sentry.spec.ts` เช็คผลลัพธ์อีกที เผื่อ config ถูกแก้ · พลาดแล้ว**ไม่มีสัญญาณอะไรเลย** ไม่ error ไม่มีเทสแดง รู้ตอนไปหา error ใน Sentry แล้วไม่เจอ

---

## 2. Modular Monolith

### Module (bounded context)

```
apps/api/core/src/
├─ modules/
│   ├─ iam/           users, auth, session, password + RBAC ระดับระบบ
│   │   ├─ auth/          login, session, password reset
│   │   ├─ user/          profile
│   │   └─ system/        RBAC (ตารางสร้าง Phase 0 · โค้ด Phase 7)
│   ├─ organization/  organizations, members, teams
│   ├─ project/       projects, members, statuses, sprints
│   ├─ task/          tasks, assignees
│   ├─ audit/         activity log (ชื่อฟีเจอร์) — ตาราง audit.logs
│   ├─ discussion/    comments, attachments        (Phase 3)
│   ├─ field/         custom field definitions     (Phase 4)
│   ├─ view/          views, view columns          (Phase 4)
│   ├─ chat/          chat adapters                (Phase 2)
│   ├─ notify/        email + outbox worker
│   └─ storage/       S3 wrapper (ไม่มี schema ของตัวเอง)
├─ shared/            base entity, decorators, guards, interceptors
└─ main.ts
```

**Module ↔ schema เป็น 1:1** — ยกเว้น `storage/` ที่ไม่มี schema

#### Object storage

**MinIO community edition ถูก archive ไปแล้ว 25 เม.ย. 2026** ไม่มี official image ใหม่อีก · image ตัวสุดท้ายคือ `RELEASE.2025-09-07` ซึ่งจะไม่ได้ security patch ตลอดไป

ลองจริงสามตัวด้วยเกณฑ์เดียวกัน (สร้าง bucket · presigned PUT/GET · ตัด signature ต้องโดนปฏิเสธ · URL หมดอายุ · ลบ):

| | Garage 2.3.0 | RustFS | SeaweedFS |
| --- | --- | --- | --- |
| License | AGPL-3.0 | Apache 2.0 | Apache 2.0 |
| Image | **66 MB** | 195 MB | 248 MB |
| RAM ตอนว่าง | **3.8 MB** | 72 MB | 68 MB |
| ตั้งค่า | toml + init 4 ขั้น | env 2 ตัว | s3.json + flags |
| ผ่านเกณฑ์ | 5/6 | 6/6 | 6/6 |

**เลือก Garage** — เบาที่สุดชัดเจน (RAM น้อยกว่า MinIO 28 เท่า) · production มาตั้งแต่ 2020 · ยังพัฒนาอยู่จริง · ค่า init จ่ายครั้งเดียวใน init container

ข้อที่ Garage ตกไม่ใช่รูรั่ว — URL หมดอายุแล้วมันตอบ `400 Date is too old` แทน `403` · test เลยเช็คว่าโดนปฏิเสธ ไม่เช็ครหัสตรง ๆ

**สองอย่างที่ต้องรู้ ไม่งั้นเสียเวลาหาสาเหตุนาน**

- **region ต้องตรงกัน** Garage default เป็น `garage` ส่วน AWS SDK เป็น `us-east-1` · ไม่ตรงกันจะพังทุกคำสั่งด้วย `Authorization header malformed` ซึ่งอ่านแล้วเหมือนปัญหา credential
- **ปิด checksum ของ SDK** AWS SDK v3 ใส่ CRC32 ให้ทุก upload โดยอัตโนมัติ · บน presigned URL มันคือ header ที่ browser ไม่ได้ส่ง ทำให้ store ตอบ `InvalidDigest` · ต้องตั้ง `requestChecksumCalculation: 'WHEN_REQUIRED'`

**Client เป็น `@aws-sdk/client-s3` ไม่ใช่ client ของยี่ห้อไหน** — โค้ดไม่รู้จักคำว่า Garage เลย ตัวแปรก็ชื่อ `S3_*` เปลี่ยน server ทีหลังคือแก้ compose อย่างเดียว

**Garage ไม่มี web UI ในตัว** ต่างจาก MinIO — มีแค่ Admin API กับ CLI

port ที่ publish ออกมาอยู่ช่วง 4xxx (`S3_PORT=4900`, UI `4909`) — ในคอนเทนเนอร์ยังเป็น 3900/3903 ตาม default ของ Garage · ย้ายออกจาก 39xx เพราะช่วงนั้นชนกับของอย่างอื่นบนเครื่อง dev ง่าย เรื่องเดียวกับที่ MinIO เคยชนที่ 9000

ลองของ community สามตัว มีตัวเดียวที่ใช้กับ Garage v2 ได้จริง:

| | ผล |
| --- | --- |
| `khairul169/garage-webui` | จัดการ bucket/key ได้ แต่หน้า cluster พัง — เรียก `/v1/status` ที่ v2 ถอดออกแล้ว (ตอบ 400) |
| `noooste/garage-ui` | **ใช้ได้ครบ** อ่าน layout/node/bucket/object ได้ · ประกาศรองรับ v2.1.0+ |
| `waazaafr/garage-s3-simple` | ไม่ได้ลอง |

ขึ้นมาพร้อม `docker compose up -d` ที่ port 4909

- **ต้องใส่ `AUTH_ADMIN_ENABLED=true`** ไม่งั้นมันอ่าน username/password แล้วเมินเฉย แล้วเปิดหน้าเว็บโดยไม่มี login เลย (ลองแล้ว log บอก `enabled_methods=["none"]`)
- ถือ admin token ไว้ในตัว จึง bind กับ `127.0.0.1` เท่านั้น · บน Bangmod ต้องอยู่หลัง Caddy ที่มี auth หรือไม่เปิดออกเลย
- ถ้าแค่อยากดูไฟล์ ใช้ `aws --endpoint-url http://localhost:4900 s3 ls s3://taskflow --recursive` ก็พอ (ลองแล้ว upload/download/delete ผ่านหมด)

**Phase 1 ทำแค่ 6 module:** `iam`, `organization`, `project`, `task`, `notify`, `storage`

### File Layout Within a Module

ใช้แบบเรียบง่ายก่อน — `entity / service / controller / dto`

```
module/
├─ xxx.entity.ts
├─ xxx.service.ts
├─ xxx.query-service.ts   (ถ้าจำเป็น — ดูด้านล่าง)
├─ xxx.controller.ts
├─ dto/
└─ xxx.module.ts
```

> ไม่ใช้ 4 ชั้น (domain/application/infrastructure/presentation) ตั้งแต่แรก เพราะทีมเล็กทำนอกเวลา ความเสียดทานจะสะสมเร็ว — โครงโฟลเดอร์รีแฟกเตอร์ทีหลังได้ในวันเดียว ต่างจากขอบเขต module และ schema ที่แก้ยาก

### Rules to Enforce

1. **Module เรียกกันผ่าน public interface เท่านั้น** (`exports:` ใน NestJS module) ห้าม import service/repository ข้ามโดยตรง
2. **Domain service ห้าม join ข้าม module** — ต้องการชื่อ user ให้เรียก `UserService.findByIds()`
3. **Read ที่ซับซ้อนใช้ Query Service แยก** — ดูหัวข้อถัดไป
4. **Activity log เขียนใน transaction เดียวกับ business logic · notification ผ่าน event**
   `TaskService → เขียน task + audit row ใน tx เดียว → commit → emit 'task.assigned' → NotifyModule`
   ดูเหตุผลใน [Activity log เขียนยังไง](#how-the-activity-log-is-written)
5. **บังคับขอบเขตด้วย ESLint** (`eslint-plugin-boundaries`) ไม่พึ่งความจำหรือ code review
6. **Module กลาง (`audit`, `discussion`, `field`, `view`) ต้องไม่รู้จัก task** — รู้แค่ `entity_type` + `entity_id`

### Query Service (read model)

List view หน้าเดียวต้องการ task + status + assignee + team + project ถ้าห้าม join ทั้งหมดจะกลายเป็น N+1 query ทันที

**ทางออก:** ยอมรับตั้งแต่แรกว่ามี read layer ที่ join ข้าม schema ได้ แต่**แยกออกมาชัดเจน** ไม่ใช่แหกกฎเงียบๆ ตอนเร่งงาน

```
TaskQueryService     // อ่านอย่างเดียว join ได้ ส่ง DTO แบน
TaskService          // เขียน + business logic ห้าม join
```

กติกา:

- Query service **ห้ามเขียนข้อมูล** เด็ดขาด
- Query service ห้ามถูกเรียกจาก domain service ของ module อื่น — เรียกได้จาก controller เท่านั้น
- ตั้งชื่อไฟล์ `*.query-service.ts` ให้เห็นชัดตอน review

### Reading the Audit Log From Other Modules

`audit.logs` จะถูกใช้จากหลายที่ — assignee picker (Phase 1), stale detection (Phase 3), handover (Phase 4), dashboard

**ให้ `AuditService` เปิด method เฉพาะ ไม่ให้ module อื่น join ตาราง `audit.logs` เอง**

เหตุผล: ถ้าปล่อยให้ทุก module join เอง สุดท้ายจะไม่มีใครกล้าแก้โครง `audit` เลย

**แต่ตั้งชื่อ method ให้เป็นภาษาของ `audit` ไม่ใช่ของ task**

```ts
// ✅ audit ไม่ต้องรู้ว่า "assignee" คืออะไร
findRecentTargets(actorId, action, limit)

// ❌ audit เริ่มรู้จัก domain ของ task
getRecentAssignees(userId)
```

> ไม่มี `orgId` ใน signature ต่างจากที่เอกสารเขียนไว้เดิม — มาจาก request context เหมือนทุก query ในระบบ · org ที่ส่งเข้ามาเป็น argument คือ argument ที่ส่งผิดได้

---

## Conventions

กติกาที่ต้องใช้เหมือนกันทุก module — ตัดสินไว้ล่วงหน้าเพื่อไม่ให้แต่ละส่วนออกมาคนละแบบ

### API

**Path**

```
GET    /api/v1/projects/:projectId/tasks
POST   /api/v1/projects/:projectId/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
```

- Nested แค่ชั้นเดียว (`/projects/:id/tasks`) — ลึกกว่านั้นใช้ flat path + query param
- ใช้ `PATCH` เสมอสำหรับแก้ไข ไม่ใช้ `PUT`
- ชื่อ resource เป็นพหูพจน์เสมอ

**Response — ไม่ใช้ envelope**

```jsonc
// single resource → ส่งตรงๆ
{ "id": "...", "title": "..." }

// list → มี meta
{
  "data": [ ... ],
  "meta": { "nextCursor": "...", "hasMore": true }
}
```

**Error — RFC 7807 แบบย่อ**

```jsonc
{
  "statusCode": 422,
  "code": "STATUS_IN_USE", // string คงที่ ให้ frontend เช็ค
  "message": "ลบไม่ได้ ยังมีงานใช้สถานะนี้อยู่", // ภาษาไทย แสดงผู้ใช้ได้เลย
  "details": { "taskCount": 12 }, // optional
}
```

**Pagination — cursor-based**

`?limit=50&cursor=xxx`

ใช้ cursor ไม่ใช่ offset เพราะ list เรียงด้วย LexoRank ที่แทรกกลางได้ — offset จะข้ามแถวหรือแสดงซ้ำ

**HTTP status ที่ใช้**

| Code | ใช้เมื่อ                                                  |
| ---- | ------------------------------------------------------ |
| 200  | สำเร็จ (GET, PATCH)                                     |
| 201  | สร้างสำเร็จ (POST)                                       |
| 204  | ลบสำเร็จ ไม่มี body                                       |
| 400  | request ผิดรูปแบบ                                        |
| 401  | ไม่ได้ login                                             |
| 403  | login แล้วแต่ไม่มีสิทธิ์                                      |
| 404  | ไม่เจอ (รวมกรณีอยู่คนละ org — ไม่ใช้ 403 เพื่อไม่บอกใบ้ว่ามีอยู่จริง) |
| 409  | conflict เช่นลบ owner คนสุดท้าย                           |
| 422  | ผิดกติกาทางธุรกิจ เช่นลบ status ที่มี task ใช้อยู่                |

### Naming

**DB ใช้ `snake_case` · TypeScript ใช้ `camelCase`**

ไม่ต้องเขียน `@Column({ name: '...' })` ทีละฟิลด์ — ตั้ง naming strategy ครั้งเดียวทั้งโปรเจกต์

```ts
// src/database/data-source.options.ts
import { SnakeNamingStrategy } from './snake-naming.strategy'

buildDataSourceOptions(url) // → { namingStrategy: new SnakeNamingStrategy(), ... }
```

```ts
// เขียน entity แบบ camelCase ปกติ TypeORM แปลงให้เอง
@Column() orgId: string;         // → org_id
@Column() parentTaskId: string;  // → parent_task_id
```

- ถ้าต้อง override ค่อยใช้ `@Column({ name: '...' })` เฉพาะฟิลด์นั้น
- Raw query / migration ต้องเขียน `snake_case` เอง

> เดิมตั้งใจใช้ `typeorm-naming-strategies` แต่ **เขียนเองใน repo แทน** — package นั้น peer range ยังค้างที่ `^0.2.0 || ^0.3.0` (โปรเจกต์ใช้ TypeORM 1.1) และ import `typeorm/util/StringUtils` ซึ่งเป็น internal path ไม่ใช่ public API · โค้ดที่เขียนเองใช้อัลกอริทึม `snakeCase` ตัวเดียวกันเป๊ะ มี test คุมไว้ที่ `snake-naming.strategy.spec.ts`
>
> จุดที่ต้องระวัง: `externalChannelIDs` → `external_channel_i_ds` (acronym + พหูพจน์) — เจอเคสแบบนี้ให้ระบุ `@Column({ name })` ตรง ๆ

### Permission Hierarchy

```
System  (ทั้งเว็บ — พวกเราดูแล)
  │  RBAC เต็มรูปแบบ · ไม่ผูกกับ org ใด · 2-5 คน
  │  ข้าม org_id scope ได้ (ต้องประกาศชัด)
  ▼
Org  (ลูกค้าสร้างกันเอง)
  │  role คงที่: owner / admin / member
  ├─ Team    → admin / member
  └─ Project → admin / member
```

**สองชั้นนี้แยกขาดจากกัน อย่าเอามาปนกัน**

|          | System                         | Org                  |
| -------- | ------------------------------ | -------------------- |
| โครงสร้าง | RBAC (role → permission ใน DB) | string คงที่ในโค้ด      |
| ผูกกับ org | ไม่                             | ใช่                   |
| แก้ได้ไหม  | แก้ mapping ใน DB ไม่ต้อง deploy  | ไม่ต้องยืดหยุ่น มีแค่ 3 แบบ |
| จำนวนคน  | 2-5                            | ทุกคน                 |

> **อย่าเอา RBAC มาใช้กับ org role** — org role มีแค่ 3 แบบและไม่ต้องการความยืดหยุ่น ใส่ RBAC จะซับซ้อนโดยไม่ได้อะไร

#### org role ทำอะไรได้ และเช็คที่ไหน

กติกาอยู่ที่ `src/permission/ability.ts` ที่เดียว เป็น CASL rule ไม่ใช่ `if (role === 'owner')` กระจายตาม controller
· สองที่เขียนกติกาเดียวกันคือสองกติกา และอันที่เขียนทีหลังคือตัวที่ไม่มีใครกลับไปเทียบ

| | member | admin | owner |
| --- | --- | --- | --- |
| อ่านทุกอย่างใน org | ✓ | ✓ | ✓ |
| สร้าง project | ✓ | ✓ | ✓ |
| จัดการคนใน org (`Member`) | | ✓ | ✓ |
| **ตั้ง/ถอด owner** | | | ✓ |
| แก้ชื่อ/slug ของ org | | | ✓ |
| ลบ org | | | ✓ |

**owner มีได้หลายคน (โมเดล GitHub) และ org ต้องมี owner อย่างน้อยหนึ่งคนเสมอ** — บังคับที่ application
เพราะ "อย่างน้อยหนึ่งแถวในกลุ่มนี้ต้องเป็น owner" ไม่มี CHECK ไหนพูดได้
· 🔒 **เงื่อนไขอยู่ใน `UPDATE` ไม่ใช่ `SELECT` นับก่อนแล้วค่อยเขียน** — สอง admin ถอด owner สองคนสุดท้ายพร้อมกัน
จะอ่านเจอ "มี owner สองคน" ทั้งคู่ แล้วผ่านทั้งคู่ เหลือศูนย์ โดยไม่มี error ที่ไหน
(ทรงเดียวกับ [session rotation](#auth) และ `OutboxWorker.claim()`)

**`Member` เป็น subject แยกจาก `Organization`** เพราะสองอันนี้ให้คำตอบต่างกันสำหรับ admin —
admin ดูแลคนใน org ได้ แต่จัดการตัว org ไม่ได้ · และ "ตั้ง/ถอด owner" เขียนเป็น `cannot` สองข้อ
ทั้งขาขึ้นและขาลง: ห้ามเฉพาะขาขึ้น admin ก็ยังถอด owner ทิ้งได้จนไม่เหลือใครตั้งกลับ

**เช็คที่ไหน — ขึ้นกับว่า resource รู้ได้ตอนไหน**

| resource | เช็คที่ | ตัวอย่าง |
| --- | --- | --- |
| คือ org ที่กำลัง act อยู่ (รู้จาก context) | guard — `@RequirePermission(action, 'Organization')` | `PATCH /v1/org` |
| คือแถวที่ต้อง load ก่อน | service หลัง load — `permissions.assert(...)` | `PATCH /v1/org/members/:userId` |

`can()` บังคับส่ง resource ([เหตุผล](#permission-hierarchy)) และ guard ยังไม่ได้ load อะไร
· ฉะนั้น `ContextResolvedSubject` จำกัดไว้ที่ `'Organization'` อย่างเดียว —
`@RequirePermission('delete', 'Project')` **คอมไพล์ไม่ผ่าน** ไม่ใช่กติกาที่ต้องจำ

> guard ตัวนี้ผูกกับ route ด้วย `UseGuards` ที่อยู่ใน decorator เอง **ไม่ใช่ `APP_GUARD`** —
> มันอ่าน request context ที่ `AuthGuard` เติม จึงต้องรันทีหลัง และลำดับของ global guard
> ตัดสินโดยลำดับที่ module ประกาศ provider ซึ่งแปลว่าความปลอดภัยของทุก route
> ไปขึ้นกับลำดับ import ใน `app.module.ts` · route guard รันหลัง global guard เสมอไม่ว่าลำดับนั้นเป็นยังไง

#### project role เห็นอะไร และกั้นที่ไหน

ชั้นล่างสุดของผัง — และเป็นชั้นเดียวที่**กั้นด้วย query ไม่ใช่ด้วยการถาม `can()` ทีละแถว**

| ใคร | เห็น project ไหน | ทำอะไรได้ |
| --- | --- | --- |
| org `owner` / `admin` | **ทุก project ใน org** ถึงไม่ได้เป็นสมาชิก | ทุกอย่าง (`manage all`) |
| project `admin` | project ที่ตัวเองอยู่ | `manage` project นั้นกับงานในนั้น |
| project `member` | project ที่ตัวเองอยู่ | อ่าน · สร้าง/แก้ task ในนั้น (ลบไม่ได้) |
| org `member` ที่ไม่ได้อยู่ project นั้น | **ไม่เห็นเลย** | — |

> ที่ org owner/admin เห็นทุก project ไม่ใช่ความสะดวก — เป็นทางออกของเคส project ที่สมาชิกลาออกหมด
> แล้วไม่เหลือใครเข้าถึงได้อีก · ด้วยเหตุผลเดียวกันจึง**ไม่มีกฎ "project admin คนสุดท้าย"**
> แบบที่ org มีกฎ owner คนสุดท้าย

**สร้าง project ได้เฉพาะ owner/admin** ([เหตุผล](./04-features/phase-1.md#project)) ·
⚠️ `ability.ts` เคยเขียนกลับข้าง (`can('create', 'Project')` อยู่ใน block ของ member) และไม่มีใครเห็น
เพราะยังไม่เคยมี endpoint ไหนถาม — แก้ให้ตรง doc แล้วใน §4

**🔒 กั้นสองอย่างที่ไม่เหมือนกัน**

- **`ProjectService.list` กั้นใน SQL** — org member ได้ `INNER JOIN project.members`,
  owner/admin ไม่ join · กรองทีหลังแปลว่าแถวถูกส่งออกไปแล้ว และซ่อนใน sidebar แปลว่าใครรู้ URL ก็เปิดได้
- **`ability.ts` กั้นทีละแถว** — org member ได้ `can('read', 'all')` แล้ว **`cannot('read', 'Project')`
  กับ `cannot('read', 'Task')` ทับ** แล้วได้คืนเป็นราย project จาก `actor.projectRoles`
  · CASL ใช้กฎ**ตัวท้ายสุดที่ match** ลำดับนี้จึงถูก
  · ⚠️ ก่อน §4 มีแค่ `can('read', 'all')` ล้วนๆ ซึ่งแปลว่า member อ่าน project ไหนก็ได้ — ขัดกับตารางข้างบน
    และไม่มีใครเห็นเพราะยังไม่มีใครเรียก

> **กฎนี้เขียนไว้สองที่ และเลี่ยงไม่ได้** — `can()` ตอบเรื่องแถวเดียว แต่ลิสต์ต้องการ `WHERE`
> · ที่ผูกสองอันไว้ไม่ให้เพี้ยนคือ **test** ไม่ใช่ความระวัง: `test/project.spec.ts`
> เช็คว่าทุก role ผลของ `list()` เท่ากับเซตที่ `can('read', 'Project', { id })` ตอบว่าได้ · แก้ข้างเดียวแล้วแดง

**`actor.projectRoles` ใส่ทีละ project ไม่ใช่โหลดทั้งหมด** — service ที่ load แถวมาแล้ว
ประกอบ actor ที่มี role ของ project นั้นอันเดียว · โหลดทุก project ที่คนนั้นอยู่เพื่อตอบเรื่อง project เดียว
คือการโหลดซ้ำแบบเดียวกับที่ [`ContextResolvedSubject`](#permission-hierarchy) ห้าม guard ทำ
และ map ที่มี id อื่นปนอยู่คือช่องให้กฎไป match ผิดตัว

**404 ไม่ใช่ 403 ตอนมองไม่เห็น** — 403 บน project ที่ member ไม่ได้อยู่ = ยืนยันว่ามี project id นั้นอยู่ใน org
ซึ่งคือสิ่งที่กติกา "member เห็นเฉพาะที่ตัวเองอยู่" ปิดไว้พอดี · เส้นแบ่ง:
**มองไม่เห็น = 404 · เห็นแต่ทำไม่ได้ = 403** (คนที่อยู่ใน project แล้วเปลี่ยนชื่อไม่ได้ ต้องได้คำตอบตรงๆ ไม่ใช่ 404 ที่อ่านเหมือนบั๊ก)

**คนที่มี system role ไม่ได้เป็นสมาชิก org โดยอัตโนมัติ** — เข้าถึงข้อมูล org ผ่าน permission ระดับ system หรือ impersonate เท่านั้น ห้ามแอบใส่ตัวเองเข้า `organization.members`

**กติกาที่ต้องบังคับ**

1. **ข้าม org scope ต้องประกาศชัด** ไม่ใช่ bypass เงียบๆ

   ```ts
   @SkipOrgScope()
   @RequireSystemPermission(SYSTEM_PERMISSIONS.ORG_READ)
   async listAllOrgs() { ... }
   ```

   เห็นได้ทันทีตอน review ว่า endpoint ไหนข้าม scope

2. **ทุก action ของ system admin ต้องลง activity log** พร้อมระบุว่าเป็นระดับ system — เพราะเป็นการเข้าถึงข้อมูลข้าม org ต้องตรวจย้อนหลังได้

3. **Support ใช้ impersonate ดีกว่าเปิด API อ่านข้าม org** — สวมสิทธิ์ user ในบริบท org นั้น ปลอดภัยกว่าและ log ชัดว่าใครสวมเป็นใคร

4. **บังคับ 2FA สำหรับคนที่มี system role** (Phase หลัง — [กลไกลงแล้วตั้งแต่ Phase 1](#two-factor-totp) เหลือแค่ policy ที่บังคับ)

**Back-office: app แยก คนละ registrable domain**

```
www.domain.com          → @web/client       ผู้ใช้ทั่วไป
admin.otherdomain.com   → @web/backoffice   system role
```

> เดิมข้อนี้เขียนว่า "รวมใน app เดียว แยก route + guard" · เปลี่ยนเป็นแยก app
> เพราะสองเว็บนี้คนละหน้าที่กันจริง และการแยก **registrable domain** ทำให้
> cookie jar แยกโดย browser ไม่ใช่โดย guard ที่เราต้องไม่ลืมเขียน

**ทำไมต้องคนละ registrable domain ไม่ใช่แค่คนละ subdomain** — SameSite นับทุก
subdomain ใต้ domain เดียวกันเป็นพวกเดียวกัน ([ตารางที่วัดไว้](#csrf)) · คนละ
registrable domain เท่านั้นที่ browser ปฏิเสธ cookie ให้เอง

**account เดียวมีทั้ง system role และ org membership ได้** — ไม่ห้าม และไม่ต้องมี
constraint ห้าม เพราะขอบเขตมาจาก domain ไม่ได้มาจาก role: account เดียวก็ยังต้อง
login สองรอบ และแต่ละ session ถือสิทธิ์เฉพาะฝั่งของตัวเอง

- **แนะนำให้แยก account** (`punch@` / `punch.admin@`) — ถ้าตัวหนึ่งโดน phish
  ความเสียหายจำกัดอยู่ฝั่งเดียว · เป็นคำแนะนำ ไม่ใช่กฎที่บังคับใน schema
- **สิ่งที่ต้องมีจริงคือ audit ต้องระบุบทบาท** ตามกติกาข้อ 2 ข้างบน — account เดียว
  สองบทบาทจึงยังไล่ย้อนได้ว่าตอนนั้นทำในฐานะไหน

แชร์โค้ดผ่าน `@repo/ui` กับ `@repo/shared` — component หรือ type ที่ใช้สองฝั่ง
ต้องดันขึ้น package ไม่ใช่ก๊อปสองที่

> Phase 0 สร้างแค่ตาราง + seed permission keys · **ไม่มีโค้ดอ่านจนถึง Phase 7** — flag ที่ข้าม `org_id` scoping เป็นช่องโหว่ที่อันตรายที่สุด ควรทำตอนระบบนิ่งและมี test ครอบคลุม · งาน support ช่วงแรกใช้ psql/Postman พอ

### Data Types

> 🔒 **ต้องทำ** — วันเวลาใช้ `timestamptz` เท่านั้น เก็บ UTC · ห้ามใช้ `timestamp`

| ใช้เก็บ            | ชนิด                                         |
| ---------------- | ------------------------------------------- |
| วันเวลา (มีเวลา)   | **`timestamptz`** เท่านั้น — ห้ามใช้ `timestamp` |
| วันที่ล้วน (ไม่มีเวลา) | `date` เช่น `sprints.start_date`             |
| Primary key / FK | `uuid`                                      |
| เงิน / estimate   | `numeric` ไม่ใช่ `float`                      |
| ข้อความ           | `text` ไม่ต้องกำหนดความยาว                    |
| อีเมล             | `citext`                                    |
| JSON             | `jsonb` ไม่ใช่ `json`                         |
| IP               | `inet`                                      |

**เก็บทุกอย่างเป็น UTC ใน DB แล้วแปลงเป็น timezone ผู้ใช้ที่ frontend**

TypeORM ต้องระบุ type ชัดเจน ไม่งั้นจะได้ `timestamp` แทน:

```ts
@Column({ type: 'timestamptz' }) dueDate: Date;
@CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
```

### Implementation Notes

รายละเอียดการ implement ที่ตัดสินไว้แล้ว — อย่าเดาเอง

#### `org_id` scoping

> 🔒 **ต้องทำ** — `org_id` ทุกตารางที่แถวของมันเป็นของ org ใด org หนึ่ง · ที่ไม่มีคือที่ไม่ได้เป็นของ org ไหนเลย: schema `iam`, `billing.plans` และ `organization.organizations` (org_id เท่ากับ id ตัวเอง — [เกณฑ์เต็ม](./02-database/rules.md#multi-tenancy)) · Phase 0 ต้องมี test ว่า org A มองไม่เห็นข้อมูล org B

**ตัดสินแล้ว: Phase 0 ทำชั้น application · RLS เลื่อนไป Phase 2**

เหตุผลตรงกับหลักการ "แก้ยากทำตอนนี้" ของเอกสารนี้เอง — `CREATE POLICY` เป็นงาน _additive_ เพิ่มทีหลังได้โดยไม่ต้อง migrate ข้อมูลและไม่ต้องแก้ schema ต่างจาก `org_id` column, `timestamptz`, และ partition ของ `audit.logs` ที่เป็นประตูทางเดียวจริงๆ

Phase 0 จึงลงแรงกับ **repository base class + isolation test** ซึ่งเป็นจุดที่บั๊กอยู่จริง แล้วค่อยเพิ่มตาข่ายนิรภัยระดับ DB ตอนระบบนิ่ง

**ชั้นที่ 1: AsyncLocalStorage เก็บ context** _(Phase 0)_

[`shared/org-scope/request-context.ts`](../../apps/api/core/src/shared/org-scope/request-context.ts) ถือ `AsyncLocalStorage<{ orgId, userId }>` ไว้ตัวเดียว แล้วเปิดทางเข้าสองทาง — เข้าถึงได้ทุกที่โดยไม่ต้องส่ง parameter ผ่านทุกชั้น

| เปิด context ด้วย | ใช้ตอน |
| --- | --- |
| `openRequestContext` (`enterWith` + cell) | HTTP request — `AuthGuard` เรียก **ก่อน `await` แรก** แล้วเติมค่าทีหลัง |
| `runWithRequestContext` (`run`) | background job · seed · test |

`AuthGuard` เป็นที่เดียวที่เปิด context ของ HTTP request แล้ว — `RequestContextMiddleware` ที่เคยเปิดให้ชั่วคราวถูกลบทิ้งพร้อมกับ guard ตัวจริง

> **ทำไมเป็นสองตัว ไม่ใช่ตัวเดียว** — `run` ปิด scope ตัวเองตอน callback คืนค่า ซึ่งใช้ใน guard ไม่ได้เพราะ `canActivate` คืน `boolean` · เหตุผลเต็มพร้อมผลวัดอยู่ที่ [Auth](#auth) ซึ่งเป็นที่ที่ guard ถูกเขียน

**ชั้นที่ 2: Repository wrapper** _(Phase 0)_

**ห่อ ไม่ใช่ extend** — `Repository<T>` มี method หลายสิบตัวและมีทางออกทาง raw SQL ด้วย extend แล้ว override ไม่ครบคือช่องโหว่ที่ไม่มีใครเห็น · wrapper เปิดเฉพาะ method ที่ scope แล้ว ถ้าขาดอะไรให้เพิ่มเข้าไปพร้อม scope ไม่ใช่ไปหยิบ repository ดิบมาใช้

```ts
export class OrgScopedRepository<T> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly scopeColumn: 'orgId' | 'id' = 'orgId',
  ) {}
}

// query builder ไม่มีตัวไหนเป็น default — ทุก call site ต้องบอกว่าเอาแบบไหน
projects.queryBuilder.withOrg('project').andWhere(...)  // scope ด้วย org
users.queryBuilder.base('user')                         // iam ไม่มี org_id
```

**`withOrg` ไม่มีอยู่บน entity ที่ไม่มีคอลัมน์ `orgId`** — `users.queryBuilder.withOrg()` compile ไม่ผ่าน · ก่อนหน้านี้มันพังตอน runtime ด้วย `Property "orgId" was not found in "User"`

`base()` คือ `createQueryBuilder` เปล่า ๆ ของ TypeORM — สำหรับ `iam.*` กับ `billing.plans` ที่**ไม่มี `org_id` ตั้งแต่แรก** มันคือตัวที่ถูกต้อง ไม่ใช่ทางหนี (profile ของ user ไม่ผูกกับ org เพราะ user อยู่ได้หลาย org) · ส่วนบนตารางที่**มี** `org_id` การเรียก `base()` คือการข้าม org ซึ่งต้องมีเหตุผลอธิบายได้

`withOrg` คืน type ที่**ตัด `where` / `orWhere` ออก** — สองตัวนี้คือทางเดียวที่จะปลด scope โดยไม่ตั้งใจ (`where` แทนที่เงื่อนไขทั้งหมดที่ตั้งไว้รวมถึง org · `orWhere` ขยายออกไปจากมัน) · `andWhere` กับ `Brackets` ใช้แทนได้หมด

> type อย่างเดียวไม่พอ — `andWhere` ประกาศว่าคืน `this` พอ chain แล้ว TypeScript คืน type เต็มกลับมา · มี Proxy ห่อซ้ำที่ throw ถ้าเรียกสองชื่อนี้ ไม่ว่าจะลึกแค่ไหน

สี่จุดที่พลาดง่ายและมี test คุมไว้แล้ว:

| จุด | ถ้าทำผิด |
| --- | --- |
| `where` แบบ array คือ **OR** — ต้องใส่เงื่อนไข org ลงทุก branch | ใส่ข้างนอกครั้งเดียว query จะกว้างขึ้นไม่ใช่แคบลง |
| caller ระบุ org อื่นมาเอง → **ตัด branch นั้นทิ้ง** ไม่ใช่เขียนทับ | เขียนทับแล้วตอบคนละคำถามกับที่ถาม (`findById(orgB)` คืน org A) |
| `softDelete()` ของ TypeORM **ไม่ยิง subscriber** ต้องเซ็ต `deletedBy` เอง | ได้ `deleted_at` แต่ไม่มี `deleted_by` → CHECK ฟ้อง |
| `save()` ที่มี `id` มาด้วยกลายเป็น `UPDATE ... WHERE id` — ต้อง**เช็คก่อนว่า org นี้เป็นเจ้าของ** ไม่ใช่แค่ประทับ org ลงไป | ประทับอย่างเดียว = ส่ง id ของ org อื่นมาแล้ว**ย้ายแถวนั้นเข้ามาเป็นของตัวเอง** · ฝั่ง read กันไว้หมดแล้วแต่ฝั่ง write เปิดอยู่ |

- ทุก service ใช้ตัวนี้ ไม่ inject `Repository` ตรง
- ตั้ง ESLint rule ห้าม inject `Repository<T>` ธรรมดา (เปิดที่ `src/modules/**`)
- Endpoint ที่ต้องข้าม scope จริงๆ ต้องมี `@SkipOrgScope()` ประกาศชัด
- **ต้องมี test ว่า query จาก org A มองไม่เห็นข้อมูล org B** — ข้อนี้ไม่มีข้อยกเว้น
- `find` / `findAndCount` / `count` / `exists` **ไม่รับ `skip`** — ตัดออกจาก type แล้ว (`ScopedFindManyOptions`) เพราะ offset paging ทับกับ [cursor pagination](#api) ที่ตกลงไว้ · `findAndCount` คืน `[rows, total]` ซึ่งชวนให้เผลอใส่ `skip` มากที่สุด แต่ `sort_order` เป็น LexoRank ที่แทรกกลางได้ พอมีคนแทรก page ถัดไปจะซ้ำแถวเดิมหรือข้ามแถวไปเลย · `take` (limit) ยังใช้ได้ · ที่ไหนที่ไม่ได้เรียงด้วย `sort_order` และต้องการ offset จริงๆ ให้ลงไปที่ `queryBuilder.withOrg()` — ตั้งใจข้ามเหมือน `base()`

**ชั้นที่ 3: Postgres Row-Level Security** _(Phase 2)_

```sql
ALTER TABLE task.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task.tasks FORCE ROW LEVEL SECURITY;   -- ⚠️ ห้ามลืมบรรทัดนี้
CREATE POLICY org_isolation ON task.tasks
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

> ⚠️ **`ENABLE` อย่างเดียวไม่กันเจ้าของตาราง** — Postgres ยกเว้น table owner จาก policy ของตัวเองเสมอ ถ้า app ต่อ DB ด้วย role ที่เป็นเจ้าของตาราง policy จะไม่ทำงานเลย **โดยไม่มี error** และเราจะเข้าใจผิดว่ามีสองชั้นทั้งที่มีชั้นเดียว
>
> แก้ได้สองทาง: ใส่ `FORCE ROW LEVEL SECURITY` หรือให้ app ต่อด้วย role ที่ไม่ใช่เจ้าของตาราง — เลือกอย่างใดอย่างหนึ่ง

ตอนทำ Phase 2 ต้อง set ค่าตอนเริ่มทุก transaction:

```ts
// ❌ อันตราย — SET LOCAL ไม่รับ parameter ต้อง string interpolation = SQL injection
await queryRunner.query(`SET LOCAL app.current_org_id = '${orgId}'`)

// ✅ set_config() รับ parameter ได้ · arg ที่ 3 = true หมายถึง LOCAL
await queryRunner.query(`SELECT set_config('app.current_org_id', $1, true)`, [
  orgId,
])
```

> ⚠️ **จุดที่พลาดง่ายที่สุด** — `SET LOCAL` ใช้ `$1` ไม่ได้ ถ้าเผลอต่อ string จะเปิดช่อง SQL injection ที่ระดับที่อันตรายที่สุดของระบบ ใช้ `set_config()` เสมอ

#### Transaction

> ❓ **ยังไม่ตัดสิน** — ทางเลือกตอนเปิด RLS ใน Phase 2 (ดูตารางท้ายหัวข้อ) · ส่วน "write ใช้ transaction, read ไม่ใช้" ตัดสินแล้ว

**ตัดสินแล้ว: เฉพาะ write ที่ใช้ transaction · read ไม่ต้อง**

```ts
await this.dataSource.transaction(async (manager) => {
  const task = await manager.save(Task, { ... });
  await manager.insert(AuditLog, { ... });   // ← audit อยู่ใน tx เดียวกัน
});
```

เรียบง่ายที่สุด และพอสำหรับผู้ใช้ 20 คน/วัน

**แต่ต้องรู้ว่าทำไมข้อนี้ผูกกับ RLS** — `set_config(..., true)` เป็น transaction-local ส่วน `repository.find()` ของ TypeORM **ไม่ได้เปิด transaction** (statement เดียวเป็น implicit transaction ของตัวเอง) ค่าที่ set ไว้จึงหายไปก่อน query จะรัน

ดังนั้นวันที่เปิด RLS ใน Phase 2 ต้องเปลี่ยนเป็นอย่างใดอย่างหนึ่ง:

| ทางเลือก                                            | ได้อะไร                       | เสียอะไร                                       |
| -------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| Global interceptor ห่อ**ทุก** request รวม read       | RLS ทำงานครบทุกที่ · เปลี่ยนที่เดียว | ถือ connection นานขึ้น                           |
| Pin `QueryRunner` ต่อ request ผ่าน AsyncLocalStorage | คุมได้ละเอียด                   | ชิ้นส่วนเยอะ · เสี่ยง connection leak ถ้าลืม release |

> อย่าเพิ่งเลือกตอนนี้ — ตัดสินตอนเริ่ม Phase 2 พร้อมของจริง

#### How the Activity Log Is Written

> 🔒 **ต้องทำ** — audit row เขียนใน transaction เดียวกับ business logic ไม่ผ่าน event emitter

**ตัดสินแล้ว: เขียน audit row ใน transaction เดียวกับ business logic ไม่ผ่าน event emitter**

`@nestjs/event-emitter` เป็น in-process, synchronous และอยู่**นอก** transaction — ถ้า task commit สำเร็จแล้ว listener throw หรือ process ตายพอดี **log จะหายเงียบๆ โดยไม่มี error บอก**

เอกสารนี้ย้ำเองหลายที่ว่า _ประวัติย้อนหลังสร้างใหม่ไม่ได้_ และเราเลือก outbox pattern ให้อีเมลด้วยเหตุผลเดียวกันนี้ — activity log สำคัญกว่าอีเมล จึงต้องได้การรับประกันที่แน่นกว่า ไม่ใช่หลวมกว่า

```
TaskService
  ├─ tx: save(task) + insert(auditLog)   ← atomic
  └─ commit → emit 'task.assigned'       ← notification · Phase 5 เพิ่ม automation
                                            ห้าม audit เด็ดขาด (ดูด้านล่าง)
```

**Event emitter ยังใช้ต่อ** — แต่ใช้กับ notification อย่างเดียว ซึ่ง at-most-once รับได้ (และมี `notify.outbox` รองรับอีกชั้น)

บังคับด้วยรูปของ API ไม่ใช่ด้วยวินัย — [`AuditService.record(manager, entry)`](../../apps/api/core/src/modules/audit/audit.service.ts) รับ `EntityManager` ของ transaction เข้ามา แล้ว **throw ถ้าไม่มี transaction เปิดอยู่** · event listener รันหลัง commit ไปแล้ว เรียกยังไงก็ไม่ผ่าน

#### LexoRank / sort_order

> 🔒 **ต้องทำ** — column เป็น `text COLLATE "C"` · ไม่ใช่ integer เรียงติดกัน

ใช้ **`fractional-indexing`** (library ของ Figma ใช้ production จริง) ไม่ต้องเขียนเอง

```ts
import { generateKeyBetween } from 'fractional-indexing'

generateKeyBetween(null, null) // 'a0'  — item แรก
generateKeyBetween('a0', null) // 'a1'  — ต่อท้าย
generateKeyBetween('a0', 'a1') // 'a0V' — แทรกกลาง
```

**ต้องระวัง**

- Column เป็น `text` **พร้อม `COLLATE "C"`** — ไม่งั้นเรียงไม่ตรงกันข้ามเครื่อง/locale
  ```sql
  sort_order text COLLATE "C" NOT NULL
  ```
- Index ต้องมี `sort_order` ต่อท้าย: `(org_id, project_id, sort_order)`
- **Rebalance job** — ลากไปมาบ่อยมาก key จะยาวขึ้น (`a0VVVVV...`) ตั้ง job รีเซ็ตเมื่อ key ยาวเกิน 50 ตัว (นานๆ ครั้ง แต่ควรเผื่อ)
- ⚠️ **`generateKeyBetween` ไม่ตรวจว่า bound สลับข้างกัน** — `('a1', 'a0')` **ไม่ throw** แต่คืน `'a0V'`
  ซึ่งเป็น key ที่ถูกต้องทุกอย่างและเรียงอยู่**ต่ำกว่าทั้งคู่** · แถวไปโผล่ผิดที่โดยไม่มี error ที่ไหนเลย
  (วัดกับ fractional-indexing 4.0.0) · มันจะ throw เฉพาะตอนคำนวณไม่ได้จริงๆ เช่น `('a0','a0')` หรือ magnitude prefix คนละตัว
  · เคสนี้เกิดจากการอ่าน neighbour มาจากลิสต์ที่ไม่ได้ `ORDER BY sort_order` ซึ่งเป็นบั๊กที่ควรดังไม่ใช่เงียบ

**เรียกผ่าน [`#shared/sort-order`](../../apps/api/core/src/shared/sort-order.ts) ไม่ใช่ import library ตรงๆ** —
ที่เดียวที่ผูก "alphabet ของ library" เข้ากับ "`COLLATE "C"` ของคอลัมน์" ไว้เป็นลายลักษณ์อักษร
และเป็นที่ที่ดักเคส bound สลับข้างข้างบน · `between(before, after)` กับ `sequence(n)`

#### Soft Delete

> 🔒 **ต้องทำ** — unique constraint ของตารางที่ soft delete ต้องเป็น **partial index** (`WHERE deleted_at IS NULL`)

ใช้ `@DeleteDateColumn` ของ TypeORM — กรอง `deleted_at IS NULL` อัตโนมัติ

**ครอบคลุมแค่ไหน — วัดกับ TypeORM 1.1 จริง ไม่ใช่เดา**

| กรณี                            | TypeORM ทำให้? | ต้องทำเอง                                         |
| ------------------------------ | ------------- | ------------------------------------------------ |
| `find` / `count` / `exists`     | ✅             | —                                                |
| **QueryBuilder**               | ✅             | — เติม `andWhere` เองจะซ้ำ (`withDeleted()` คือทางกลับเข้าไป) |
| `update()` — รวมถึง soft delete ซ้ำ | ❌             | เติม `deletedAt: IsNull()` เอง ไม่งั้นเขียนทับว่าใครลบและนับ 90 วันใหม่ |
| Raw SQL                        | ❌             | เติมเงื่อนไขเอง                                      |
| Unique constraint              | ❌             | ต้องเป็น **partial index** ไม่งั้นชนกับแถวที่ลบแล้ว        |
| `deleted_by`                   | ❌             | set เองผ่าน subscriber หรือใน UPDATE ตรง ๆ          |

> เอกสารเดิมเขียนว่า QueryBuilder ไม่กรองให้ — **ผิด** ลอง `getQuery()` แล้วมี `deleted_at IS NULL` ติดมาเอง · เคสนี้ล็อกไว้ด้วย test แล้วเผื่อ TypeORM เปลี่ยนพฤติกรรม
>
> Relation ที่ join มายังไม่ได้วัด เพราะ entity ในระบบนี้ไม่ประกาศ relation เลยสักตัว (ดู [กฎขอบเขต module](#rules-to-enforce))

```sql
-- ✅ ถูก
CREATE UNIQUE INDEX ON project.statuses (project_id, name) WHERE deleted_at IS NULL;

-- ❌ ผิด — ลบแล้วสร้างชื่อเดิมไม่ได้
UNIQUE (project_id, name)
```

> 🔒 **ข้อยกเว้นเดียวที่ตั้งใจแหก: `UNIQUE (project_id, number)` ของ `task.tasks` เป็น index เต็ม**
>
> เหตุผลกลับด้านกับกฎข้างบนพอดี — partial มีไว้ให้**ใช้ชื่อเดิมซ้ำได้**หลังลบ
> แต่**เลขงานต้องไม่ถูกแจกซ้ำ** คนแปะ `DEV-87` ไว้ในแชทแล้ววันหนึ่งเลขนั้นไปโผล่บนงานคนละใบ
> คือความเสียหายที่ย้อนไม่ได้ ([รายละเอียด](./02-database/schema.md#schema-task))
>
> ข้อยกเว้นถัดไปต้องเถียงจากหลักเดียวกันนี้ ไม่ใช่อ้างว่ามีข้อยกเว้นอยู่แล้ว

**Soft delete แบบ cascade ต้องทำในโค้ด ไม่ใช่ DB** — `ON DELETE CASCADE` ทำงานกับ hard delete เท่านั้น

อยู่ที่ [`shared/entity/cascade-soft-delete.ts`](../../apps/api/core/src/shared/entity/cascade-soft-delete.ts) — เดินลงตาม `AGGREGATE_CHILDREN` ใน transaction เดียว

- **แผนที่ "อะไรเป็นของอะไร" เขียนมือ ไม่ได้อ่านจาก DB** ต่างจาก retention ที่อ่านจาก `pg_constraint` ได้ · เพราะ DB ตอบคำถามนี้ไม่ได้: `tasks.project_id` เป็น RESTRICT ตั้งใจ (จะลบ project ต้องเคลียร์ task ก่อน) ซึ่งไม่ได้แปลว่า task ไม่ใช่ของ project · `NOT NULL` ก็ตอบไม่ได้: `tasks.status_id` เป็น NOT NULL แต่ลบ status ต้องย้าย task ไม่ใช่ลบ
- **มี test บังคับว่าทุกตารางที่ soft delete ได้ ต้องอยู่ใน `AGGREGATE_CHILDREN` หรือ `ROOTS`** — ตารางใหม่ที่ลืมใส่จะ fail ทันที ไม่ใช่ปล่อยให้แถวอยู่ค้างเกินพ่อแม่มันไป
- แถวที่ถูกลบไปแล้วจะถูกข้าม ไม่เขียนทับ `deleted_at` เดิม — ไม่งั้นนาฬิกา 90 วันเริ่มใหม่และเสียบันทึกว่าใครลบจริง
- Comment / attachment เป็น polymorphic ต้องแมตช์ `entity_type` ด้วย ไม่งั้นลบ task แล้วลาก comment ของ project ไปด้วย

#### FK On Delete

> 🔒 **ต้องทำ** — `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT` เพราะการลบ user คือ anonymize ไม่ใช่ hard delete

FK cascade เป็น**ตาข่ายนิรภัยตอน hard delete** เท่านั้น (cleanup job, ลบ org ทิ้ง) — การทำงานปกติใช้ soft delete ซึ่ง cascade ไม่ทำงาน

| Action     | ใช้เมื่อ                           | ตัวอย่าง                                                          |
| ---------- | ------------------------------- | --------------------------------------------------------------- |
| `CASCADE`  | ลูกไม่มีความหมายถ้าพ่อหาย            | `project.statuses.project_id`, `iam.sessions.user_id`      |
| `SET NULL` | ลูกยังมีความหมาย แค่ขาดข้อมูลอ้างอิง    | `task.tasks.sprint_id`, `chat.channels.default_assignee_id`     |
| `RESTRICT` | บังคับให้ application จัดการลำดับเอง | `task.tasks.project_id`, `task.tasks.status_id`, `*.created_by` |

**`created_by` / `updated_by` / `completed_by` เป็น `RESTRICT` ไม่ใช่ `SET NULL`**

เพราะการลบ user คือ **anonymize** (ล้างชื่อ/อีเมล แต่แถวยังอยู่) ไม่ใช่ hard delete — FK จึงยังชี้ได้ ประวัติไม่พัง และ column คง `NOT NULL` ได้

> `SET NULL` ใช้ได้เฉพาะ column ที่ **nullable** — ถ้า `NOT NULL` แล้วใส่ `SET NULL` จะ error ตอน runtime ไม่ใช่ตอนสร้าง table

#### Retention — Each Kind of Data Has Its Own Lifetime

> 🔒 **ต้องทำ** — `audit.logs` partition รายเดือน + `PRIMARY KEY (id, occurred_at)` ตั้งแต่ migration แรก · ห้ามลบ

| ข้อมูล                                 | เก็บนานแค่ไหน                | เหตุผล                          |
| ------------------------------------ | -------------------------- | ------------------------------ |
| `audit.logs`                         | **ไม่ลบ** (archive หลัง 2 ปี) | ประวัติที่ต้องใช้ตรวจสอบ สร้างใหม่ไม่ได้ |
| Soft-deleted ทั่วไป                    | hard delete หลัง **90 วัน**  | ถังขยะ                          |
| `users` (`pending_deletion`)         | anonymize หลัง **30 วัน**    | ให้เวลากู้บัญชีคืน                   |
| `notify.outbox` (`sent`)             | ลบหลัง **30 วัน**            | ส่งไปแล้วไม่มีประโยชน์              |
| `iam.sessions` (หมดอายุ/revoked) | ลบหลัง **7 วัน**             | โตเร็วมาก ไม่มีค่าเก็บ              |
| `password_reset_tokens`              | ลบหลัง **1 วัน**             | อายุแค่ 30 นาที เก็บไว้ตอบ ticket    |
| `organization.invitations` (จบแล้ว)    | ลบหลัง **90 วัน**            | ใครเชิญ/ยกเลิก อยู่ใน `audit.logs`  |
| `notify.notifications` (อ่านแล้ว)      | ลบหลัง **90 วัน**            | กล่องขาเข้า ไม่ใช่ประวัติ             |

> ⚠️ **สองแถวล่างยังไม่มีโค้ดกวาด** — `resolvePurgeOrder` หาตารางจาก catalog โดยดูว่ามี
> `deleted_at` ไหม ทั้งสองตารางไม่มี (จบชีวิตด้วย `accepted_at`/`revoked_at` และ `read_at`)
> จึงหลุดรอบกวาดไปเงียบๆ · ต้องเขียน sweep ของตัวเองตอนฟีเจอร์มาถึง —
> invitations ที่ **Phase 2** คู่กับ API · notifications ที่ **Phase 3**
> · ไฟล์แนบก็เหมือนกัน: ลบแถวแล้ว object ใน storage ยังอยู่ ([Phase 3](./04-features/phase-3.md#ไฟล์แนบ))

**`audit.logs` โตเร็วที่สุดในระบบ** — ทำ **partition รายเดือน** ตั้งแต่แรก เพราะทำทีหลังต้องย้ายข้อมูลทั้งตาราง

```sql
CREATE TABLE audit.logs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at  timestamptz NOT NULL,
  ...
  PRIMARY KEY (id, occurred_at)   -- ⚠️ ไม่ใช่ PRIMARY KEY (id) เฉยๆ
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.logs_2026_08 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

> ⚠️ **ตารางที่ partition ต้องมี partition key อยู่ใน unique/primary key ทุกตัว** — Postgres บังคับ ดังนั้น `PRIMARY KEY (id)` เฉยๆ จะสร้างไม่ผ่าน ต้องเป็น `PRIMARY KEY (id, occurred_at)`
>
> ฝั่ง TypeORM entity ก็ต้องประกาศเป็น composite (`@PrimaryColumn()` สองตัว) ไม่ใช่ `@PrimaryGeneratedColumn('uuid')` ตัวเดียว — `audit.logs` จึงเป็นตารางเดียวที่**ไม่ใช้ base entity เลยสักคอลัมน์** (อีกสองข้อยกเว้นใช้บางส่วน ดู [ตารางเทียบ](./02-database/rules.md#base-entity))

#### Where the retention jobs live

`apps/api/core/src/maintenance/` — cron สองตัว ตีสามตามเวลาไทย (ระบุ `Asia/Bangkok` ตรง ๆ ไม่อิงเวลาเครื่อง เพราะ container ที่รันบน UTC จะกลายเป็นกลางวันของคนใช้งาน)

| Job                | เวลา  | ทำอะไร                                                                          |
| ------------------ | ----- | ------------------------------------------------------------------------------ |
| `audit-partitions` | 03:05 | สร้าง partition ของ 12 เดือนข้างหน้าที่ยังไม่มี · log `error` ถ้า `audit.logs_default` มีแถว |
| `retention`        | 03:15 | ทั้ง 5 นโยบายในตารางข้างบน                                                          |

- **ลำดับการลบเป็นเรื่องจริง ไม่ใช่รายละเอียด** — `tasks.project_id` เป็น RESTRICT ลบ project ก่อน task ไม่ได้ · ลำดับจึงอ่านจาก `pg_constraint` ตอนรันแล้ว topological sort ไม่ใช่ลิสต์ที่เขียนมือ ตารางใหม่ที่ลืมใส่ในลิสต์คือแถวที่ไม่มีวันถูกลบ และไม่มีอะไรฟ้อง
- **`iam.users` ไม่เคย hard delete** — anonymize อย่างเดียว เพราะ `created_by` ของทุกตารางชี้มาที่นี่แบบ RESTRICT · ถ้า sweep ลบได้จริงมันจะลบได้เฉพาะคนที่ยังไม่ทันสร้างอะไร ซึ่งแปลว่าพฤติกรรมขึ้นกับว่าคนนั้นทำงานไปมากแค่ไหนก่อนลาออก
- **นับ 30 วันของ `pending_deletion` จาก `deletion_requested_at`** ไม่ใช่ `deleted_at` (นั่นคือปลายทาง คือวันที่ anonymize เสร็จ) และไม่ใช่ `updated_at` (แตะแถวทีนึงนับใหม่ทุกที) — [เหตุผลเต็ม](./02-database/schema.md#schema-iam)
- **`pg_try_advisory_lock`** กันสอง instance ยิง cron พร้อมกัน · ตัวที่สอง**ข้าม**ไม่ใช่ต่อคิว — กว่าจะได้ lock งานก็เสร็จไปแล้ว
- **`JOBS_ENABLED=false`** ปิด job ทั้งสองในโปรเซสนั้น (default `true`) — มีไว้สำหรับเครื่อง dev ที่ต่อ DB ร่วมกัน
- ตารางที่ลบไม่ผ่าน (เช่น project ที่ soft delete แล้วแต่ task ยังไม่ถูกลบตาม) จะ log แล้วข้าม ไม่ล้มทั้ง sweep · แต่ตารางนั้นค้างจนกว่าจะแก้ต้นเหตุ เพราะ batch เดียวคือ statement เดียว

#### Redis / Queue — ยังไม่มี และเงื่อนไขที่จะมี

**ไม่ใช้กับ email / notification** — [`EmailService.enqueue(manager, …)`](../../apps/api/core/src/modules/notify/email.service.ts) รับ transaction ของ caller เข้าไป แถวใน `notify.outbox` จึง commit พร้อมกับสิ่งที่มันประกาศ · Redis กับ Postgres commit ร่วมกันไม่ได้ ย้ายไป `queue.add()` เมื่อไหร่ได้ **dual write** ทันที — rollback แล้วเมลออก หรือ commit แล้ว job หาย โดยไม่มี error ที่ไหนเลย

วิธีแก้มาตรฐานของ dual write คือเขียนลง DB ให้ commit ก่อนแล้วค่อย relay เข้า queue ซึ่งก็คือ outbox ที่มีอยู่แล้ว — queue จึง**เพิ่มชั้นให้ ไม่ได้แทนที่** วันที่เอามาจริง `OutboxWorker` เปลี่ยนจาก "ส่งเอง" เป็น "โยนเข้า queue" ส่วน `EmailService` ไม่ต้องแก้

**ถ้า poll ทุก 15 วินาทีช้าไป** — `pg_notify` ใน transaction เดียวกับที่ insert (ส่งจริงตอน commit เท่านั้น จึงได้การรับประกันเดิม) แล้วให้ worker `LISTEN` · ได้ latency ของ queue โดยไม่เพิ่ม service · poll คงไว้เป็นตาข่ายรองกรณี connection ขาด

**จะเพิ่ม Redis เมื่อ** รัน API ตั้งแต่ 2 instance ขึ้นไป **และ** ต้องการอย่างใดอย่างหนึ่งใน — websocket pub/sub (in-app notification, Phase 3) · rate limit ข้าม instance · session revocation cache ที่เช็คทุก request · ทั้งสามคือ _state ที่ใช้ร่วมกันระหว่าง process_ ซึ่งเป็นเส้นแบ่งว่าอะไรควรอยู่ Redis อะไรควรอยู่ Postgres

**ไม่ตั้งรอไว้ล่วงหน้า** — service ที่ไม่มีใครใช้ไม่มี health check ไม่มี backup ไม่มีเทสต์ และไม่มีใครรู้ตอนมันดับ (เทียบกับ Garage ที่ขึ้นตั้งแต่ Phase 0 แต่มาพร้อม `StorageService`, `/health/ready`, `backup.sh`, `storage.spec.ts`) · และค่าที่ต้องตั้งตอบต่างกันคนละทางระหว่าง cache กับ queue — `allkeys-lru` ลบ job ทิ้งเงียบๆ ตอนความจำเต็ม จึงตัดสินตอนรู้ว่าจะใช้ทำอะไรเท่านั้น

---

### Auth

**Token**

|         | อายุ    | เก็บที่          |
| ------- | ------ | -------------- |
| Access  | 15 นาที | httpOnly cookie |
| Refresh | 15 วัน  | httpOnly cookie |

Cookie flags: `httpOnly · Secure · SameSite=Lax · Path=/` — ทั้งสี่ตัว
(`access_token` `refresh_token` `active_org` `two_factor_challenge`)

**`refresh_token` กับ `two_factor_challenge` เคยเป็น `path=/api/v1/auth` — ขยายเป็น `/`
แล้วเมื่อ 2026-09-07 หลังวัดกับ browser จริง** ที่ scope แคบซื้อให้คือ request ที่ทำ
`Cookie` header หลุดนอก endpoint auth จะเสีย access token 15 นาที ไม่ใช่ refresh token
15 วัน · ที่มันแลกไปคือสิ่งที่ไม่เห็นจนกว่าจะยิงจริง:

**cookie ที่ผูก path ไม่ถูกส่งมากับ request ของหน้าเว็บ** — ฉะนั้น `proxy.ts` ของ Next
ก็ไม่มี token, Server Action ก็ไม่มี (มันยิงกลับไปที่ URL ของหน้าตัวเอง) · การต่ออายุ
session จึงทำได้เฉพาะ JavaScript ฝั่ง browser เท่านั้น และอาการที่โผล่คือ **cold load
ที่ห่างจากครั้งก่อนเกิน 15 นาทีจะ render ออกมาเป็น signed-out แล้วค่อยซ่อมตัวเองหลัง
hydrate** ซึ่งคือ cold load ส่วนใหญ่ · วัดแล้ว: TTL 20 วิ รอ 24 วิ แล้ว reload ได้ 401,
พอเปลี่ยนเป็น `/` ได้ 200 พร้อม token ใหม่

ทั้งคู่ยัง `httpOnly` เหมือนเดิม ไม่มี script อ่านได้ที่ path ไหนทั้งนั้น และทุก request ที่
พก refresh token เพิ่มมาเป็น same-origin ไปหา server ตัวที่ออก cookie นั้นเอง · **ที่เพิ่ม
ขึ้นจริงคือความเสี่ยงต่อ log ของเราเอง** — อะไรที่บันทึก `Cookie` header เต็มๆ จะบันทึก
credential ที่อายุยาวกว่าเดิม เป็นเรื่องที่ต้องรู้และต้องกัน ไม่ใช่เรื่องที่คุ้มจะแลกกับ
สถาปัตยกรรมที่ server ต่อ session ของตัวเองไม่ได้

> `two_factor_challenge` ย้ายด้วยเหตุผลของตัวเอง: login ที่ขับด้วย Server Action จะผ่าน
> ขั้นรหัสผ่านแล้วตายที่ขั้นกรอกโค้ด เพราะมันตั้ง cookie ที่ action ถัดไปมองไม่เห็น

**Access token payload — เอาแค่ที่จำเป็น**

```json
{ "sub": "<userId>", "sid": "<sessionId>", "exp": 1234567890 }
```

ไม่มี role ไม่มีชื่อ ไม่มีอีเมล ไม่มี org — ดึงจาก `GET /api/v1/me`

> เหตุผล: ถ้าใส่ role ใน token แล้ว admin ถอดสิทธิ์ ต้องรอ 15 นาทีถึงมีผล

**`org` เคยอยู่ใน payload นี้ — เอาออกแล้ว** เหตุผลเดียวกับ role ทุกตัวอักษร: ถอดคนออกจาก org
แล้วต้องรอ 15 นาทีถึงมีผล · และตั้งแต่ [หนึ่งคนอยู่ได้หลาย org](./04-features/phase-1.md#หนึ่งคนอยู่ได้หลาย-org-ตั้งแต่-phase-1)
ค่าเดียวใน token ก็ตอบไม่ได้อยู่ดีว่าคนนี้กำลังทำงานให้ org ไหน · ต้นทุนเป็นศูนย์
เพราะ guard query session อยู่แล้วทุก request

#### org ไหนของ request นี้

**สองคำถามที่ปนกันง่ายที่สุดในระบบนี้**

| คำถาม | คำตอบเป็น | อยู่ที่ไหน |
| --- | --- | --- |
| คนนี้ใช้ org ไหนได้บ้าง | **ลิสต์** | `organization.members` · ตอบผ่าน `GET /api/v1/me` |
| **request นี้**ทำงานให้ org ไหน | **หนึ่งเดียวเสมอ** | `RequestContext.orgId` |

ข้อที่สองเป็นข้อบังคับ ไม่ใช่ทางเลือก — `org_id` เป็น `NOT NULL` ทุกตาราง ตอน `create()`
จึงต้องมีค่าเดียวให้ประทับลงแถว `org_id IN (…)` ไม่มีอะไรให้เขียน · ฝั่ง read ก็พังเงียบกว่า
คือข้อมูลสองบริษัทปนกันในหน้าเดียว และ policy ของ RLS ก็ต้องเขียนตามนั้นด้วย

**client บอกว่า org ไหนผ่าน cookie `active_org` ที่ตั้งด้วย `POST /api/v1/me/active-org`**

- httpOnly · same-origin อยู่แล้ว ([CSRF](#csrf)) จึงไม่ต้องมี token อะไรเพิ่ม
- **guard ตรวจกับ membership ทุก request** — cookie ที่ถูกแก้ไม่ได้ทำให้เข้า org อื่นได้
  แค่ได้ 403 · cookie เป็น *ตัวเลือก* ไม่ใช่ *สิทธิ์*
- ไม่มี cookie แต่มี org เดียว → ใช้ org นั้น · มีหลาย org → ต้องเลือกก่อน
- ไม่ได้อยู่ org ไหนเลย → `orgId` เป็น `null` แต่ **login ผ่าน** ([ทำไม](./04-features/phase-1.md#หนึ่งคนอยู่ได้หลาย-org-ตั้งแต่-phase-1))
  · ส่วนหน้า Home ที่ข้าม org ใช้ `@SkipOrgScope()`
- **cookie ที่ชี้ org ที่ไม่ได้เป็นสมาชิก (หรือถูกถอดออกไปแล้ว) → 403 แล้ว _ลบ cookie ทิ้ง_**
  ไม่ใช่แค่ปฏิเสธ · ตัวเลือกที่ค้างอยู่จะทำให้เขาติด 403 ทุก request จนกว่าจะล้าง browser

**สอง error code ไม่ใช่อันเดียว** — `orgId` เป็น `null` ได้จากสองสาเหตุที่ต้องการคนละหน้าจอ

| สถานการณ์ | code | หน้าที่ควรเห็น |
| --- | --- | --- |
| อยู่หลาย org แต่ยังไม่ได้เลือก | `ORG_NOT_SELECTED` | ตัวเลือก org |
| ไม่ได้อยู่ org ไหนเลย | `NO_ORGANIZATION` | Home · สร้าง org แรก |

code เดียวสำหรับทั้งสองจะพาคนที่อยู่สามบริษัทไปหน้า "สร้าง org แรกของคุณ"

> **เก็บใน cookie ไม่ใช่ `sessions.active_org_id`** — [กติกาทิศทาง FK](./02-database/rules.md#foreign-key-rules)
> ให้ชี้ทางเดียว `task → project → organization → iam` · FK จาก `iam.sessions`
> ขึ้นไปหา `organization.organizations` เดินย้อนทาง และ `uuid` เปล่าที่ไม่มี FK
> แย่กว่าไม่มีคอลัมน์ เพราะไม่มีอะไรกันไม่ให้มันชี้ไป org ที่ถูกลบไปแล้ว

**ตรวจทุก request**

```
1. verify JWT signature + exp
2. เช็ค session จาก sid (cache 30 วินาที)
   ├─ session.revoked_at IS NULL
   ├─ session.expires_at > now
   ├─ user.status = 'active'
   └─ โหลด membership ของ user มาพร้อมกันใน fill เดียว
3. หา org ของ request จาก cookie active_org × membership  → orgId | null
4. ผ่าน → ใส่ { userId, orgId } ลง request context
```

ข้อ 2 ทำให้ deactivate / logout / ลบ account **มีผลเกือบทันที** ไม่ต้องรอ token หมดอายุ
· ข้อ 3 ทำให้ **ถอดคนออกจาก org มีผลใน 30 วินาที** ด้วยเหตุผลเดียวกัน ไม่ต้องออก token ใหม่

ต้นทุนต่ำเพราะไม่ได้ใส่ role ใน token อยู่แล้ว — ยังไงก็ต้องดึงข้อมูล user

**ข้อ 3 เกิดใน guard และต้องใช้ `enterWith` ไม่ใช่ `run`**

Auth ทั้งก้อนอยู่ใน guard ที่เดียว — verify token, เช็ค session, เปิด request context · guard เห็น route metadata (`@Public()`, `Reflector`) ซึ่ง middleware มองไม่เห็น จึงไม่ต้องแยกงานเป็นสองชั้นให้มีอะไรลืมได้

แต่มีกับดักหนึ่งข้อ: `AsyncLocalStorage.run(ctx, () => true)` ใน guard **ใช้ไม่ได้** เพราะ `canActivate` คืน boolean แล้วจบ scope ก่อน handler จะรัน ต้องใช้ `enterWith` ซึ่งเซ็ต store ให้ async context ปัจจุบันแล้วอยู่ยาว

🔒 **แต่ `enterWith` ต้องเรียกก่อน `await` แรกของ `canActivate`** — จุดนี้เคยเข้าใจผิดและ ship ออกไปแล้วรอบหนึ่ง

`enterWith` เขียน store ลง async resource ที่กำลังรัน _ณ ตอนนั้น_ · ส่วนหัวของ `canActivate` ที่ยังไม่เจอ `await` ยังรันอยู่บน resource ของ Express ซึ่ง handler สืบต่อมา — แต่โค้ดหลัง `await` รันบน promise resource ใหม่ที่ handler ไม่เคยเห็น · guard ต้อง query session ก่อนถึงจะรู้ org จึงเติมค่าตอนนั้นไม่ได้ แต่ **จอง slot ไว้ก่อนได้** ซึ่งเป็นที่มาของ `openRequestContext()` ที่คืนฟังก์ชันสำหรับเติมค่า

| ทำอะไรใน guard | controller เห็นอะไร |
| --- | --- |
| `als.run(ctx, () => true)` | `null` — scope ปิดก่อน handler รัน |
| `enterWith` **หลัง** `await` | **ไม่แน่นอน** — request แรกของ connection ถูก แต่ request ที่ 3 เป็น `undefined` |
| `openRequestContext()` ก่อน `await` แล้วเติมทีหลัง | ถูกทุกครั้ง |
| 40 request ขนาน + 10 request บน keep-alive เส้นเดียว | 0 อันเห็น org ผิด |

แถวที่สองคือบั๊กจริง วัดบน Node 22.22 (2026-09-04) — `POST /v1/me/active-org` คืน 500 `No request context` ขณะที่ login ซึ่งเป็น `@Public()` ดูปกติดี · ความ **ไม่แน่นอน** คือส่วนที่อันตรายที่สุด: ยิงมือทีละครั้งจะเห็นว่าผ่าน

สิ่งที่ทำให้เทสต์เดิมไม่จับ: มันเรียก `enterWith` _ตรงๆ ใน request handler_ ไม่ได้แยกเป็นฟังก์ชัน `guard()` ที่ถูก `await` แบบที่ Nest ทำจริง · ระยะ async หนึ่งชั้นนั้นคือทั้งหมดของบั๊ก — [`request-context.spec.ts`](../../apps/api/core/src/shared/org-scope/request-context.spec.ts) ตอนนี้ยิง server จริงที่มีรูปร่าง guard → pipe → handler ครบ

· และ **harness ในโปรเซสเดียวไม่ใช่ตัวแทนที่ถูก** — `AsyncResource` ซ้อนกันจะสืบ store ของตัวนอกมา
ซึ่งเป็นเหตุผลที่ `auth.guard.spec.ts` assert ที่ "guard เปิดและเติม context ด้วยค่าอะไร" ไม่ใช่อ่าน store กลับมา

`runWithRequestContext` (ที่ใช้ `run`) ยังเป็นตัวที่ถูกสำหรับ background job, seed และเทสต์ — สองแบบอยู่คู่กันโดยตั้งใจ

| ชั้น                        | หน้าที่                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| `AuthGuard` (`APP_GUARD`)  | `openRequestContext()` → verify JWT → เช็ค session + membership → หา org ของ request → เติม `{ userId, orgId }` → allow/deny |
| Guard ตัวถัดไป                | `PermissionService.assert` — ใช้ context ที่ตัวแรกเปิดไว้ได้เลย              |

**Library**

| ทำอะไร         | ใช้                          | ไม่ใช้ และทำไม                                                                              |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| JWT ของเราเอง   | `@nestjs/jwt` + guard เขียนเอง | `@nestjs/passport` — จ่าย 3 dependency ยุค callback เพื่อ `ExtractJwt` ที่เขียนเองบรรทัดเดียว        |
| Google OAuth  | `arctic` หลัง `OAuthService`   | `passport-google-oauth20` · ถ้าอยากได้ OIDC ตาม spec เป๊ะกว่านี้ใช้ `openid-client`                  |
| Session       | ตารางของเราเอง                  | Better Auth / Auth.js / Lucia — เข้ามาเป็นเจ้าของ schema แล้วต้องสู้กับ rotation + grace + reuse ที่มีอยู่ |

`OAuthService` ห่อ library ไว้แบบเดียวกับ `StorageService` (S3) และ `EmailService` (Resend) — หน้าที่แคบมาก แค่ _"เอา authorization code ไปแลกเป็น `{ providerUserId, email, emailVerified, name, avatar }` ที่ verify แล้ว"_ · เปลี่ยน library ทีหลังแก้ไฟล์เดียว

**ไม่เก็บ access/refresh token ของ Google** — ใช้แค่ identity ไม่ได้เรียก API ต่อ เก็บไว้คือถือของมีค่าที่ไม่ได้ใช้

**Login ด้วย Google — ตัดสินใจแล้ว**

```
Google ตอบกลับมา
   ↓
email_verified = false → ปฏิเสธทันที (ไม่ link ไม่สร้าง)
   ↓
มี oauth_accounts (provider='google', provider_user_id) แล้ว → login เลย
   ↓
ไม่มี แต่มี user ที่อีเมลตรงกัน
   ├─ status = 'active'            → ถาม "มีบัญชีนี้อยู่แล้ว จะเชื่อมกันมั้ย" → link
   ├─ status = 'pending_deletion'  → ปลดล็อกกลับเป็น active แล้ว link
   │                                 (ล้าง deletion_requested_at พร้อมกัน — CHECK ผูกไว้)
   └─ อื่นๆ (deactivated / deleted)  → ปฏิเสธ เหมือน flow login ปกติ
   ↓
ไม่มี user เลย → ขึ้นกับ feature flag public_registration
   ├─ เปิด → สร้าง user ใหม่ (password_hash = NULL)
   └─ ปิด → ปฏิเสธ ไม่สร้างเงียบๆ
   ↓
ทุกกรณีที่ link สำเร็จ → audit.logs + ส่งเมลแจ้งเจ้าตัว
```

`pending_deletion` ปลดล็อกได้เพราะ login ด้วย Google ก็คือการพิสูจน์ตัวตนแบบหนึ่ง ตรงกับที่ [Delete Account](./04-features/phase-2.md#delete-account) เขียนไว้ว่า login ภายใน 30 วันกู้บัญชีคืน — ไม่ใช่กฎใหม่

**prompt ถามก่อน link เป็น UX ไม่ใช่ security** — คนที่เห็นหน้าจอนั้นคือคนที่เพิ่งพิสูจน์ว่าคุมอีเมลนั้นได้ ถ้าเป็นคนร้ายก็กด "ใช่" เหมือนกัน · ที่กันจริงคือ `email_verified`

**และทำไมไม่ต้องกรอก password เดิมยืนยัน** — คนที่คุม mailbox นั้นยึดบัญชีได้อยู่แล้วผ่าน forgot-password ซึ่งส่งลิงก์ไปกล่องเดียวกัน การ link จึงไม่ได้เปิดประตูบานใหม่ · ความต่างเดียวคือ forgot-password _ประกาศตัวเอง_ เพราะเมลไปโผล่ในกล่องของเหยื่อ ส่วน auto-link เงียบ — **เมลแจ้งหลัง link คือสิ่งที่ปิดช่องว่างนั้น** ไม่ใช่ช่องกรอกรหัสผ่าน (ซึ่งยังพังกับบัญชีที่สมัครผ่าน Google ตั้งแต่แรกและไม่มี password ให้กรอก)

**Session = 1 การ login จาก 1 เครื่อง**

1 user login ได้ไม่จำกัดเครื่อง · **1 session มี refresh token ที่ใช้ได้ 1 อันเสมอ**

Rotation ไม่สร้างแถวใหม่ — session แถวเดียวอยู่ตลอดอายุ 15 วัน แค่เปลี่ยน token hash

```
POST /auth/refresh
  → ตรวจ hash ตรงกับ current_token_hash + session ยัง active
  → ออก access + refresh ใหม่
  → previous_token_hash = current_token_hash
    current_token_hash  = hash ของ token ใหม่
    rotated_at          = now
```

**Grace window 10 วินาที** — token ที่ตรงกับ `previous_token_hash` และ `rotated_at` ยังไม่เกิน 10 วิ ให้ผ่านได้ กันกรณีเปิดหลายแท็บแล้ว refresh พร้อมกันจนโดนเตะออก

**จับ token reuse** — token ตรงกับ `previous_token_hash` แต่เลย 10 วินาทีแล้ว = ถูกขโมย → revoke session ทันที (`revoked_reason = 'token_reuse'`) + แจ้งผู้ใช้ทางอีเมล

**Logout**

|                      | ทำอะไร                                        |
| -------------------- | --------------------------------------------- |
| ปกติ                  | revoke session ปัจจุบัน + ลบ cookie              |
| ทุกเครื่อง              | revoke ทุก session ของ user                    |
| เปลี่ยนรหัสผ่าน          | revoke ทุก session **ยกเว้นอันปัจจุบัน**            |
| Reset password สำเร็จ | revoke **ทุก session** (เผื่อโดนแฮ็ก เตะคนร้ายออก) |

**ล็อกอินด้วยอีเมลหรือ username ก็ได้** (ตัดสิน 2026-09-07)

```
POST /api/v1/auth/login { login, password, rememberMe }
```

ช่องเดียว ไม่ใช่สองช่องและไม่ใช่ radio — ตัวอักษรของสองอย่างไม่ทับกัน เพราะ username ห้ามมี `@` และมี CHECK บังคับไว้ · `UserService.findByLogin` เลือก query จากรูปร่างที่พิมพ์มา · ค่าที่ไม่ตรงอะไรเลยได้ `INVALID_CREDENTIALS` เหมือนรหัสผ่านผิด ซึ่งเป็นสิ่งที่กันไม่ให้ endpoint นี้กลายเป็นเครื่องมือไล่เดาว่า username ไหนมีอยู่

**เปลี่ยนรหัสผ่าน**

```
PATCH /api/v1/me/password
{ currentPassword, newPassword, confirmNewPassword }
```

ตรวจ `currentPassword` ทุกครั้ง · frontend เช็ค confirm ตรงกันก่อนส่ง

**ลืมรหัสผ่าน**

```
POST /auth/forgot-password { email }
  → ตอบ 204 เสมอ ไม่ว่าอีเมลจะมีในระบบหรือไม่ (กัน user enumeration)
  → ส่งเมล: https://app.x.com/reset-password?code=<token>

POST /auth/reset-password { code, newPassword, confirmNewPassword }
```

- Token อายุ **30 นาที** (env var ไม่ hardcode) ใช้ได้ครั้งเดียว — [ทำไมไม่ใช่ 10](./04-features/phase-1.md#auth--users)
- ขอใหม่ → invalidate อันเก่า
- Rate limit 3 ครั้ง/ชั่วโมง/อีเมล

### Two-factor (TOTP)

**ตัดสิน 2026-09-07: ลงกลไกใน Phase 1 · เปิดเอง ไม่บังคับใคร**

roadmap เขียนไว้ว่า 2FA เป็นของ "Phase หลัง" และ "บังคับสำหรับคนที่มี system role" — ที่ทำจริงคือครึ่งแรกลงก่อน · เหตุผล: การ**บังคับ**ต้องมี system role ให้บังคับ แต่ `iam.user_roles` ยังไม่มีแถวเลยตั้งแต่ Phase 0 · พอกลไกลงแล้ว การบังคับทีหลังกลายเป็น policy check ไม่ใช่ feature ใหม่

```
POST /api/v1/me/2fa/setup   { password }        → { secret, otpauthUrl }
POST /api/v1/me/2fa/enable  { code }            → { recoveryCodes[10] }   ← เห็นครั้งเดียว
DELETE /api/v1/me/2fa       { password }        → revoke ทุก session ยกเว้นอันปัจจุบัน

POST /api/v1/auth/login      { login, password } → { twoFactorRequired: true }  + cookie challenge
POST /api/v1/auth/login/2fa  { code }            → session
```

- **TOTP ไม่ใช่ SMS** — ไม่มีค่าส่ง ไม่พึ่งค่ายมือถือ ใช้ได้ตอนเน็ตล่ม และไม่โดน SIM swap · คอลัมน์ `phone` ที่เพิ่มมาพร้อมกัน **ไม่เกี่ยวกับ 2FA** เป็นข้อมูลโปรไฟล์ล้วนๆ
- 🔒 **secret เข้ารหัส AES-256-GCM ด้วย `TOTP_ENCRYPTION_KEY`** — hash ไม่ได้เพราะเป็น shared secret · `deploy/backup.sh` เขียน dump ลงดิสก์ สิ่งเดียวที่กั้นระหว่าง dump ที่หลุดกับ second factor ของทุกคนคือกุญแจไม่ได้อยู่ใน dump · GCM ไม่ใช่ CBC เพราะมันยืนยันความถูกต้องด้วย ciphertext ที่ถูกแก้จะ decrypt ไม่ผ่านแทนที่จะได้ secret อื่นออกมา
- 🔒 **กัน replay ด้วย `last_used_step`** — โค้ดหนึ่งอันใช้ได้ทั้งหน้าต่าง 30 วิ ถ้าไม่จำ step ที่ผ่านไปแล้ว โค้ดที่ถูกแอบมองครั้งเดียวใช้ได้สองรอบ
- **ล็อกเมื่อใส่โค้ดผิดหลายครั้ง** ใช้ `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` ชุดเดียวกับรหัสผ่าน — 6 หลักคือหนึ่งล้านครั้ง และขอ challenge ใหม่ได้เรื่อยๆ ด้วยการ login ซ้ำ หน้าต่างเวลาจึงไม่ได้จำกัดตัวเอง
- **challenge เป็น JWT อายุ 5 นาที มี `purpose: 'two_factor'`** และ **ไม่มี `sid`** — `verifyAccessToken` ปฏิเสธมันสองชั้น (claim ขาด และไม่ได้ระบุ session) ชั้นเดียวก็พอ แต่สองชั้นคือสิ่งที่กันไม่ให้การ refactor ชั้นใดชั้นหนึ่งวันหลังเปลี่ยนมันเป็นทางเข้าที่ไม่ต้องมี second factor
- **recovery code 10 อัน เก็บแต่ hash** — ตอนใช้มันมีค่าเท่ารหัสผ่าน · ใช้ได้ครั้งเดียว 🔒 ตัดด้วย statement เดียวแบบเดียวกับ session rotation
- **ปิด 2FA แล้ว revoke ทุก session ยกเว้นอันปัจจุบัน** — เป็นการลดการป้องกันของบัญชี ของที่ล็อกอินค้างที่อื่นเข้ามาตอนกฎเข้มกว่า
- **ตาราง hard delete ทั้งคู่** — soft delete แล้วมีคนลืม `deleted_at IS NULL` เมื่อไหร่ = factor ที่ยังบังคับอยู่ทั้งที่เจ้าตัวปิดไปแล้ว (กับดักเดียวกับ `oauth_accounts`)

**Password & Rate limit**

- ขั้นต่ำ 8 ตัว
- Hash ด้วย **argon2id** (หรือ bcrypt cost 12 ถ้าไม่อยากเพิ่ม dependency)
- Login ผิดหลายครั้ง → **ล็อกบัญชี ไม่ใช่นับใน memory** — `iam.users.failed_login_attempts`
  + `locked_until` · จำนวนครั้งกับระยะเวลาเป็น env var ([กติกาเต็ม](./04-features/phase-1.md#auth--users))

### CSRF

**ตัดสินแล้ว: แต่ละเว็บมี `/api/*` ของตัวเอง** — client กับ back-office เป็นคนละ
app คนละ domain และ **แต่ละ origin proxy `/api/*` ไป Nest ตัวเดียวกัน** ทุก request
จาก browser จึงเป็น same-origin เสมอ

```
www.domain.com        → @web/client        www.domain.com/api/*   → @api/core
admin.otherdomain.com → @web/backoffice    admin.otherdomain.com/api/* → @api/core
```

ผลคือ **`SameSite=Lax` พอในตัวมันเอง ไม่ต้องมี CSRF token และไม่ต้องมี CORS**
ทั้งสองฝั่ง

> 🚫 **ห้ามยุบ `/api` ไปเป็น `api.domain.com` ตัวเดียวร่วมกัน** — จะกลายเป็น
> cross-origin ทันที ต้องเปิด CORS และฝั่งที่คนละ registrable domain จะไม่ได้
> cookie เลย · ที่ได้มาคือ "ประหยัด route ใน Caddy หนึ่งบล็อก" ซึ่งไม่คุ้ม

**SameSite ดูที่ *site* ไม่ใช่ *origin*** — จุดนี้เข้าใจผิดกันบ่อย และเคยเขียนผิด
ไว้ในไฟล์นี้เอง · วัดด้วย headless Chrome จริง:

| หน้าเว็บอยู่ที่      | ยิงไปที่               | `Lax` | `None; Secure` | ต้องมี CORS |
| ------------------- | -------------------- | ----- | -------------- | ---------- |
| `www.example.test`  | `www.example.test/api` | ส่ง   | –              | ไม่ต้อง     |
| `www.example.test`  | `api.example.test`   | **ส่ง** | ส่ง            | ต้องมี      |
| `other.test`        | `api.example.test`   | ไม่ส่ง | ส่ง            | ต้องมี      |

แถวกลางคือจุดที่คนคิดว่าจะไม่ส่ง — `www.example.test` กับ `api.example.test`
คนละ origin แต่ **registrable domain เดียวกัน** จึงนับเป็น same-site · แถวล่างคือ
cross-site จริง ถึงจะไม่ส่ง

> เพราะงั้นการแยก subdomain ใต้ domain เดิม **ไม่ได้ทำให้ auth พัง** สิ่งที่ต้อง
> เพิ่มจริงคือ CORS · ส่วนเหตุผลที่ยังควรมี CSRF token เมื่อมีหลาย subdomain คือ
> SameSite นับทุก subdomain เป็นพวกเดียวกัน — subdomain ที่โดนยึดหรือที่ให้ user
> อัปโหลด content ได้ จะยิง request พร้อม cookie ได้โดย SameSite ไม่กัน

**ตอนเขียน auth (Phase 1): attribute ของ cookie ต้องอยู่ที่เดียว** พร้อม test ที่
ปักค่าไว้ · การเปลี่ยน topology ทีหลังจะได้เป็นการแก้จุดเดียวที่เห็นชัดใน diff
ไม่ใช่ไล่หาว่ามีกี่ที่ที่ set cookie

### Path ownership

`handle_path /api/*` กิน namespace `/api` ทั้งก้อน — วาง route handler ของ Next
ไว้ใต้ `app/api/` แล้วมันจะ **ไม่ถูกเรียกถึงเลย และไม่มี error** แค่ได้ response
จาก Nest แทน ซึ่งหาสาเหตุยาก

| path            | เจ้าของ                                          |
| --------------- | ----------------------------------------------- |
| `/api/*`        | `@api/core` — Caddy จองไว้ ทั้งสอง domain          |
| `/bff/*`        | Next route handler (`app/bff/**/route.ts`)      |
| `/monitoring`   | Sentry tunnel (rewrite ที่ `withSentryConfig` ใส่ให้) |
| `/_next/*`      | Next asset                                       |
| ที่เหลือ          | Next page                                        |

> **App Router ไม่ได้บังคับให้ route handler อยู่ใต้ `/api`** — `app/api/` เป็น
> ธรรมเนียมตกทอดจาก Pages Router ที่บังคับจริง · ไฟล์ `route.ts` วางที่ไหนก็เป็น
> endpoint ที่ path นั้น เพราะงั้นใช้ `/bff/*` แล้วไม่ต้องแตะ Caddy เลย

### Web transport — ยิง API จากฝั่งไหนก็ได้ แต่ไม่เท่ากัน

`apps/web/client/src/lib/api/` มี factory เดียว ออกมาสามหน้าตา ต่างกันแค่สองข้อ:
**cookie มาจากไหน** และ **เขียน cookie ได้หรือเปล่า**

| ยิงจาก | `cookies().set()` | 401 แล้วทำอะไร | ใช้ตัวไหน |
| --- | --- | --- | --- |
| browser | – (browser จัดการเอง) | refresh แล้วยิงซ้ำ | `lib/api/browser.ts` |
| Server Component ตอน render | **throw** | ยอมแพ้ | `apiForRender()` |
| Server Action / Route handler | ได้ | refresh แล้วยิงซ้ำ | `apiForAction()` |
| `proxy.ts` | เขียนลง response | refresh **ก่อน** render | `src/proxy.ts` |

🔒 **`apiForRender` ต้อง refresh ไม่ได้ ไม่ใช่แค่ไม่ทำ** — render ที่ refresh จะ*สำเร็จ*
คือ API หมุน token ให้จริง แต่เขียน cookie ไม่ได้ ฉะนั้น browser ยังถือตัวเก่า · รอบหน้า
มันยื่นตัวที่ถูกหมุนทิ้งไปแล้ว พ้นหน้าต่าง 10 วิ `AuthService.detectReuse` อ่านว่าเป็น
token ที่ถูกขโมย แล้ว **revoke ทั้ง session + ยิง alert** · refresh ใน render ไม่ใช่
"ทำแล้วไม่ได้ผล" แต่คือ "ทำแล้วพังบัญชี"

**`proxy.ts` ไม่ใช่ `middleware.ts`** — Next 16 เปลี่ยนชื่อ และของใหม่ **รันบน Node
runtime เสมอ** (ใส่ `export const runtime` เป็น build error) · มันเป็นที่เดียวบน server
ที่เขียน cookie ได้ *และ* รันก่อน render · ตัดสินใจด้วยการอ่าน `exp` จาก JWT
**โดยไม่ verify signature** — คำถามคือ "ควรส่งมั้ย" ไม่ใช่ "ของจริงมั้ย" ซึ่งเป็นงานของ
guard ที่ถือ `JWT_SECRET` · ถ้า proxy verify ด้วย ต้องเอา secret ไปไว้ใน container ของ
web แล้วจำนวน process ที่ออก session ได้จะกลายเป็นสอง

วัดบน dev (Turbopack): token ยังดี **2-5 ms** ต่อ request · ตอนต้อง refresh จริง
**15-26 ms** ซึ่งเกิดครั้งเดียวต่อ 15 นาทีต่อคน · `matcher` ตัด `/api/*` `_next/*` และ
ไฟล์ที่มีนามสกุลออก ไม่งั้นต้นทุนไปโผล่ที่ asset ทุกชิ้น

**`next.config.ts` มี rewrite `/api/*` เฉพาะตอน dev** เลียน `handle_path` ของ Caddy
(ตัด prefix) เพราะ local ไม่มี Caddy · ไม่มีอันนี้คือ origin นี้ไม่มี `/api` เลย ทุก request
404 ที่ Next ก่อนถึง API

#### 🔒 ทั้งสามชั้นต้อง single-flight และเหตุผลคนละแบบกัน

`Promise.all` คือตัวที่ทำให้ทุกชั้นพัง และพังคนละท่า · **ทุกบรรทัดข้างล่างมาจากการยิงจริง
ไม่ใช่การอ่านโค้ด** — ทั้งสามเคสผ่าน unit test และ review มาแล้วตอนที่ยังพังอยู่

| ชั้น | ยิงอะไร | ก่อนแก้ | หลังแก้ |
| --- | --- | --- | --- |
| browser | `Promise.all` 6 `GET /me` | 2 refresh | **1** |
| Server Action | `Promise.all` 6 `GET /me` ใน action เดียว | 6 refresh แล้ว **ทั้ง action ตอบ 401** | **1** + 200 |
| `proxy.ts` | 8 page request ขนาน | 2 refresh | **1** |

**browser — promise ร่วมอันเดียวไม่พอ** เพราะ 401 ทั้งหกไม่ได้กลับมาพร้อมกัน สามอันแรก
เกาะ refresh เดียวกัน มันเสร็จ `inFlight` เป็น null แล้วสามอันหลังเปิดรอบใหม่ · คำถามที่ถูก
ไม่ใช่ *"มี refresh ค้างมั้ย"* แต่คือ ***"token เปลี่ยนไปแล้วหลังจาก request นี้ออกไปหรือยัง"***
— ประทับ counter ตอนส่ง เทียบตอน 401 กลับมา ถ้ามีคนหมุนไปแล้วก็ยิงซ้ำเฉยๆ

**Server Action — เหตุผลที่เคยเขียนไว้ว่าไม่ต้องมี ("one action is one request") ผิด**
เพราะมันมองข้าม `Promise.all` ใน action เดียว · ทั้งหกยื่น refresh token ตัวเดียวกัน
*พร้อมกัน* ตัวแรกหมุนสำเร็จ อีกห้า `RETURNING` ว่าง แล้วได้ `SESSION_EXPIRED` กลับมา
ทั้งหมด — **action ตอบ 401 ทั้งที่เพิ่งต่ออายุ session สำเร็จไปเมื่อกี้** · `recentRotations`
ช่วยไม่ได้เพราะมันเล่นซ้ำการหมุนที่*จบแล้ว* เป็นตาข่ายรับแท็บที่ตื่นช้า ไม่ใช่รับห้า request
ที่แข่งกันในฟังก์ชันเดียว

**`proxy.ts` — ลบ entry ทิ้งตอน settle ยังไม่พอ** ตัวที่มาหลัง flight แรกจบไม่เจออะไรให้
เกาะ เลยเปิดรอบสองด้วย token ที่ถูกใช้ไปแล้ว · มันรอดเพราะหน้าต่าง 10 วิของ API ซึ่ง
แปลว่า**ความถูกต้องของ burst ไปพิงตาข่ายฝั่ง server ที่มีไว้รับแท็บมาช้า** — refresh ที่ช้า
พอจะดัน round สองพ้นหน้าต่างนั้นจะถูกอ่านว่า token ถูกขโมยแล้ว revoke ทั้ง session
· เก็บผลที่**สำเร็จ**ไว้ 5 วิ (ผลที่ล้มทิ้งทันที จะได้ไม่ล็อกการต่ออายุไว้ตอนเน็ตสะดุด) และ
ใส่ `AbortSignal.timeout` ให้ fetch ปิดช่องที่เหลือ · แมพอยู่ระดับ module คีย์ด้วย token
ที่กำลังจะถูกใช้ ไม่ใช่คีย์ด้วย user เพราะ token ต่างหากที่บอกว่างานสองชิ้นเป็นชิ้นเดียวกัน

🔒 **`sessionLostHandler` ต้องถูกเรียกครั้งเดียวต่อ session ที่ตาย** — วางไว้ใน catch ของ
interceptor แปลว่าทุก request ที่รอ promise เดียวกันเรียกมันคนละที · วัดแล้ว **6 ครั้ง**
สำหรับ session ที่ตายครั้งเดียว ซึ่งของจริงคือ `window.location.assign` หกรอบ · ย้ายไปไว้ใน
promise ที่แชร์กัน แล้ว latch ไว้ว่า session ตายแล้ว (401 ที่มาช้ายังเปิด refresh รอบใหม่ที่
พังซ้ำได้ และ counter แก้ไม่ได้เพราะความล้มเหลวไม่ขยับ counter) · ปลด latch ด้วย response
ที่สำเร็จอันไหนก็ได้ ไม่ใช่ฟังก์ชัน reset ที่ต้องมีคนจำว่าต้องเรียก

**Server Action ต้องส่ง `user-agent` / `x-forwarded-for` ต่อ** ไม่งั้น login ที่ขับด้วย
action จะเขียน container ของ Next ลง `iam.sessions.user_agent` — หน้าจอ "อุปกรณ์ที่
ล็อกอินอยู่" จะขึ้น `axios/1.x` ที่ address เดียวกันหมดทุกแถว
