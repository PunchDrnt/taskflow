# Architecture

Stack, การแบ่ง module, และ convention ที่ทุก module ต้องใช้เหมือนกัน

> [← Overview](./00-overview.md) · เกี่ยวข้อง: [`02-database.md`](./02-database.md)

## Contents

1. [Tech Stack](#1-tech-stack)
2. [Modular Monolith](#2-modular-monolith)
3. [Conventions](#conventions) — [API](#api) · [Naming](#naming) · [Permission Hierarchy](#permission-hierarchy) · [Data Types](#data-types) 🔒 · [Implementation Notes](#implementation-notes) · [Auth](#auth) · [CSRF](#csrf)

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
| Storage        | MinIO (S3-compatible)                                             |
| Deploy         | Docker + Caddy บน Bangmod                                         |
| Error tracking | Sentry                                                            |

### Repo Layout

```
apps/
  api/core/     NestJS          (@api/core)
  web/client/   Next.js 16      (@web/client)
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

```
├─ api             NestJS
├─ web             Next.js 16
├─ postgres        + volume แยก
├─ postgres-test   ephemeral (tmpfs) สำหรับ integration test
├─ minio           + volume แยก
└─ caddy           reverse proxy + SSL อัตโนมัติ
```

> ตอนนี้ `docker-compose.yml` มีแค่ `postgres` + `postgres-test` · service ที่เหลือเพิ่มใน Phase 0

---

## 2. Modular Monolith

### Module (bounded context)

```
apps/api/core/src/
├─ modules/
│   ├─ identity/      users, auth, session, password + RBAC ระดับระบบ
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
│   └─ storage/       MinIO wrapper (ไม่มี schema ของตัวเอง)
├─ shared/            base entity, decorators, guards, interceptors
└─ main.ts
```

**Module ↔ schema เป็น 1:1** — ยกเว้น `storage/` ที่ไม่มี schema

**Phase 1 ทำแค่ 6 module:** `identity`, `organization`, `project`, `task`, `notify`, `storage`

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
getRecentActorTargets(orgId, actorId, actionType, limit)

// ❌ audit เริ่มรู้จัก domain ของ task
getRecentAssignees(orgId, userId)
```

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

4. **บังคับ 2FA สำหรับคนที่มี system role** (Phase หลัง)

**Back-office: รวมใน app เดียว แยก route + guard**

```
/admin/*         → SystemAdminGuard
/api/v1/admin/*  → API ฝั่ง system
```

แชร์ entity/service ได้หมด ไม่ต้องดูแลสองระบบ

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

> 🔒 **ต้องทำ** — `org_id` ทุกตาราง ยกเว้น schema `identity`, `billing.plans` และ `organization.organizations` (org_id เท่ากับ id ตัวเอง — [เหตุผล](./02-database.md#3-multi-tenancy)) · Phase 0 ต้องมี test ว่า org A มองไม่เห็นข้อมูล org B

**ตัดสินแล้ว: Phase 0 ทำชั้น application · RLS เลื่อนไป Phase 2**

เหตุผลตรงกับหลักการ "แก้ยากทำตอนนี้" ของเอกสารนี้เอง — `CREATE POLICY` เป็นงาน _additive_ เพิ่มทีหลังได้โดยไม่ต้อง migrate ข้อมูลและไม่ต้องแก้ schema ต่างจาก `org_id` column, `timestamptz`, และ partition ของ `audit.logs` ที่เป็นประตูทางเดียวจริงๆ

Phase 0 จึงลงแรงกับ **repository base class + isolation test** ซึ่งเป็นจุดที่บั๊กอยู่จริง แล้วค่อยเพิ่มตาข่ายนิรภัยระดับ DB ตอนระบบนิ่ง

**ชั้นที่ 1: AsyncLocalStorage เก็บ context** _(Phase 0)_

```ts
// shared/request-context.ts
export const requestContext = new AsyncLocalStorage<{
  orgId: string
  userId: string
}>()
```

**Middleware** ใส่ค่าตอนต้น request → เข้าถึงได้ทุกที่โดยไม่ต้องส่ง parameter ผ่านทุกชั้น

> ⚠️ **ใช้ guard ไม่ได้** — guard คืน `boolean` แปลว่า scope ของ `AsyncLocalStorage.run()` ปิดตั้งแต่ก่อน handler จะรัน handler เลยอยู่นอก context (ทดสอบแล้ว: `getStore()` เป็น `undefined`) · middleware เรียก `next()` จากในนั้นได้ scope จึงครอบทั้ง request

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
users.queryBuilder.base('user')                         // identity ไม่มี org_id
```

**`withOrg` ไม่มีอยู่บน entity ที่ไม่มีคอลัมน์ `orgId`** — `users.queryBuilder.withOrg()` compile ไม่ผ่าน · ก่อนหน้านี้มันพังตอน runtime ด้วย `Property "orgId" was not found in "User"`

`base()` คือ `createQueryBuilder` เปล่า ๆ ของ TypeORM — สำหรับ `identity.*` กับ `billing.plans` ที่**ไม่มี `org_id` ตั้งแต่แรก** มันคือตัวที่ถูกต้อง ไม่ใช่ทางหนี (profile ของ user ไม่ผูกกับ org เพราะ user อยู่ได้หลาย org) · ส่วนบนตารางที่**มี** `org_id` การเรียก `base()` คือการข้าม org ซึ่งต้องมีเหตุผลอธิบายได้

`withOrg` คืน type ที่**ตัด `where` / `orWhere` ออก** — สองตัวนี้คือทางเดียวที่จะปลด scope โดยไม่ตั้งใจ (`where` แทนที่เงื่อนไขทั้งหมดที่ตั้งไว้รวมถึง org · `orWhere` ขยายออกไปจากมัน) · `andWhere` กับ `Brackets` ใช้แทนได้หมด

> type อย่างเดียวไม่พอ — `andWhere` ประกาศว่าคืน `this` พอ chain แล้ว TypeScript คืน type เต็มกลับมา · มี Proxy ห่อซ้ำที่ throw ถ้าเรียกสองชื่อนี้ ไม่ว่าจะลึกแค่ไหน

สามจุดที่พลาดง่ายและมี test คุมไว้แล้ว:

| จุด | ถ้าทำผิด |
| --- | --- |
| `where` แบบ array คือ **OR** — ต้องใส่เงื่อนไข org ลงทุก branch | ใส่ข้างนอกครั้งเดียว query จะกว้างขึ้นไม่ใช่แคบลง |
| caller ระบุ org อื่นมาเอง → **ตัด branch นั้นทิ้ง** ไม่ใช่เขียนทับ | เขียนทับแล้วตอบคนละคำถามกับที่ถาม (`findById(orgB)` คืน org A) |
| `softDelete()` ของ TypeORM **ไม่ยิง subscriber** ต้องเซ็ต `deletedBy` เอง | ได้ `deleted_at` แต่ไม่มี `deleted_by` → CHECK ฟ้อง |

- ทุก service ใช้ตัวนี้ ไม่ inject `Repository` ตรง
- ตั้ง ESLint rule ห้าม inject `Repository<T>` ธรรมดา (เปิดที่ `src/modules/**`)
- Endpoint ที่ต้องข้าม scope จริงๆ ต้องมี `@SkipOrgScope()` ประกาศชัด
- **ต้องมี test ว่า query จาก org A มองไม่เห็นข้อมูล org B** — ข้อนี้ไม่มีข้อยกเว้น

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
  └─ commit → emit 'task.assigned'       ← notification เท่านั้น
```

**Event emitter ยังใช้ต่อ** — แต่ใช้กับ notification อย่างเดียว ซึ่ง at-most-once รับได้ (และมี `notify.outbox` รองรับอีกชั้น)

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

#### Soft Delete

> 🔒 **ต้องทำ** — unique constraint ของตารางที่ soft delete ต้องเป็น **partial index** (`WHERE deleted_at IS NULL`)

ใช้ `@DeleteDateColumn` ของ TypeORM — กรอง `deleted_at IS NULL` อัตโนมัติ

**แต่ไม่ครอบคลุม 4 กรณี ต้องทำเอง**

| กรณี                      | ต้องทำ                                      |
| ------------------------ | ------------------------------------------ |
| Raw query / QueryBuilder | เติม `.andWhere('x.deletedAt IS NULL')` เอง |
| Relation ที่ join มา       | TypeORM กรองให้เฉพาะ entity หลัก             |
| Unique constraint        | ต้องเป็น **partial index** ไม่งั้นชนกับแถวที่ลบแล้ว |
| `deleted_by`             | TypeORM ไม่มีให้ — set เองผ่าน subscriber      |

```sql
-- ✅ ถูก
CREATE UNIQUE INDEX ON project.statuses (project_id, name) WHERE deleted_at IS NULL;

-- ❌ ผิด — ลบแล้วสร้างชื่อเดิมไม่ได้
UNIQUE (project_id, name)
```

**Soft delete แบบ cascade ต้องทำใน service ไม่ใช่ DB** — `ON DELETE CASCADE` ทำงานกับ hard delete เท่านั้น ลบ project ต้องลบ statuses / members / sprints / tasks ทั้งหมดใน transaction เดียวเอง

#### FK On Delete

> 🔒 **ต้องทำ** — `created_by` / `updated_by` / `completed_by` เป็น `RESTRICT` เพราะการลบ user คือ anonymize ไม่ใช่ hard delete

FK cascade เป็น**ตาข่ายนิรภัยตอน hard delete** เท่านั้น (cleanup job, ลบ org ทิ้ง) — การทำงานปกติใช้ soft delete ซึ่ง cascade ไม่ทำงาน

| Action     | ใช้เมื่อ                           | ตัวอย่าง                                                          |
| ---------- | ------------------------------- | --------------------------------------------------------------- |
| `CASCADE`  | ลูกไม่มีความหมายถ้าพ่อหาย            | `project.statuses.project_id`, `identity.sessions.user_id`      |
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
| `identity.sessions` (หมดอายุ/revoked) | ลบหลัง **7 วัน**             | โตเร็วมาก ไม่มีค่าเก็บ              |
| `password_reset_tokens`              | ลบหลัง **1 วัน**             | อายุแค่ 10 นาที                   |

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
> ฝั่ง TypeORM entity ก็ต้องประกาศเป็น composite (`@PrimaryColumn()` สองตัว) ไม่ใช่ `@PrimaryGeneratedColumn('uuid')` ตัวเดียว — `audit.logs` จึงเป็นตารางเดียวที่**ไม่ใช้ base entity เลยสักคอลัมน์** (อีกสองข้อยกเว้นใช้บางส่วน ดู [ตารางเทียบ](./02-database.md#base-entity--on-every-table-with-three-named-exceptions))

Job สร้าง partition เดือนถัดไปล่วงหน้า

---

### Auth

**Token**

|         | อายุ    | เก็บที่                                  |
| ------- | ------ | ------------------------------------- |
| Access  | 15 นาที | httpOnly cookie                       |
| Refresh | 15 วัน  | httpOnly cookie · `path=/api/v1/auth` |

Cookie flags: `httpOnly · Secure · SameSite=Lax`

**Access token payload — เอาแค่ที่จำเป็น**

```json
{ "sub": "<userId>", "org": "<orgId>", "sid": "<sessionId>", "exp": 1234567890 }
```

ไม่มี role ไม่มีชื่อ ไม่มีอีเมล — ดึงจาก `GET /api/v1/me`

> เหตุผล: ถ้าใส่ role ใน token แล้ว admin ถอดสิทธิ์ ต้องรอ 15 นาทีถึงมีผล

**ตรวจทุก request**

```
1. verify JWT signature + exp
2. เช็ค session จาก sid (cache 30 วินาที)
   ├─ session.revoked_at IS NULL
   ├─ session.expires_at > now
   └─ user.status = 'active'
3. ผ่าน → ใส่ { userId, orgId } ลง request context
```

ข้อ 2 ทำให้ deactivate / logout / ลบ account **มีผลเกือบทันที** ไม่ต้องรอ token หมดอายุ

ต้นทุนต่ำเพราะไม่ได้ใส่ role ใน token อยู่แล้ว — ยังไงก็ต้องดึงข้อมูล user

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

- Token อายุ **10 นาที** ใช้ได้ครั้งเดียว
- ขอใหม่ → invalidate อันเก่า
- Rate limit 3 ครั้ง/ชั่วโมง/อีเมล

**Password & Rate limit**

- ขั้นต่ำ 8 ตัว
- Hash ด้วย **argon2id** (หรือ bcrypt cost 12 ถ้าไม่อยากเพิ่ม dependency)
- Login: 5 ครั้ง/15 นาที/อีเมล

### CSRF

- `SameSite=Lax` + วาง frontend/API ใต้ domain เดียวกันผ่าน Caddy (`app.x.com/api`) ← แนะนำ ง่ายที่สุด
- ถ้าแยก subdomain (`app.x.com` → `api.x.com`) ต้องเพิ่ม double-submit CSRF token
