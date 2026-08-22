# Phase 1 — First Real Users `v1.0.0`

ไล่ตามลำดับที่ทำได้จริง (ไม่ใช่ลำดับ priority ใน [`03-roadmap.md`](../docs/03-roadmap.md)) — ข้อล่างพึ่งข้อบน

> **สถานะไฟล์นี้:** ของชั่วคราว ไม่ใช่ spec · ตัวสเปกจริงอยู่ที่ [`.claude/docs/`](../docs/) — ถ้าขัดกัน ให้เชื่อ docs
>
> 🔒 = [binding decision](../docs/00-overview.md#binding-decisions) ผิดแล้วแก้ย้อนหลังไม่ได้
> ❓ = ยังไม่ตัดสิน ต้องเลือกก่อนถึงจะทำข้อนั้นได้

**Phase 1 คือครั้งแรกที่มีคนอื่นนอกจากเราใช้** — ของที่ Phase 0 ปล่อยผ่านได้เพราะ "ยังไม่มีใครใช้" หมดข้ออ้างตรงนี้

---

## 0. ยกมาจาก Phase 0

ของที่รู้ตัวแล้วว่าค้าง ไม่ใช่ของที่เพิ่งคิดได้

- [ ] **Branch protection บน `main`** — บังคับ PR + CI เขียว ห้าม push ตรง
      · ไม่ใช่เรื่องความเรียบร้อย: `deploy.yml` ไม่รัน test เลย มันเชื่อว่า gate รันบน `main` ไปแล้ว
      · push ตรงเข้า main ได้ = ของที่ไม่เคยผ่านอะไรขึ้น production ได้ ([ผัง](../docs/01-architecture.md#branching))
- [ ] ❓ **CI trigger `push: [main]`** — ตอนนี้ปิดอยู่ · PR ได้ CI จาก `pull_request:` ครบแล้ว
      ช่องที่เหลือคือ merge commit ที่ต่างจาก PR head · เปิด branch protection แบบ require up-to-date แทนก็ได้ เลือกอย่างใดอย่างหนึ่ง
- [ ] 🔒 **Test invariant ที่ DB บังคับเองไม่ได้** — Phase 0 เลื่อนมาเพราะยังไม่มี service ให้บังคับ **Phase 1 มีแล้ว หมดข้ออ้าง**
  - [ ] org ต้องมี `role='owner'` ≥1 แถวเสมอ (ห้ามลบ/ลดสิทธิ์คนสุดท้าย)
  - [ ] project ต้องมี `is_done_type` ≥1 อัน
  - [ ] `completed_at`/`completed_by` มีค่า **ก็ต่อเมื่อ** status ของ task นั้น `is_done_type` — คุมสองทาง ดู §6
- [ ] 🔒 **`FeatureService.isEnabled()` return `true` เสมอ — "ดักด้วย feature flag" ตอนนี้แปลว่า "เปิดอยู่"**
      · [`04-features.md:57`](../docs/04-features.md) เขียนว่า `/register` ดักด้วย `isEnabled(org, 'public_registration')` "ซึ่ง return `false` ตั้งแต่บรรทัดแรก" — **โค้ดจริง `return true`**
      · ใครสร้าง `/register` ตามสเปกโดยไม่เปิดไฟล์ดู จะได้ public registration ที่เปิดอยู่ ใน phase ที่มี org เดียว = ใครรู้ URL ก็เข้าถึงข้อมูลบริษัท
      · **ต้องเลือกก่อนเขียน endpoint แรกที่พึ่งมัน** — ให้ stub return `false` สำหรับ feature ที่ยังไม่เปิด หรือเปลี่ยนเป็น allow-list · แล้วแก้ doc ให้ตรง
      · มี test ว่า feature ที่ยังไม่เปิด return `false` จริง ไม่ใช่เชื่อคอมเมนต์
- [ ] **`identity.oauth_accounts` — migrate ไว้ แต่ feature ปิด ยังไม่ใช้** (ตัดสินแล้ว)
      · ตารางลงตาม schema ใน [`02-database.md`](../docs/02-database.md#schema-identity) · เป็นแพทเทิร์นเดียวกับ `identity.roles`/`permissions` ที่ migrate ตั้งแต่ Phase 0 แล้วไม่มีใครอ่านจนถึง Phase 7
      · **Google login ยังไม่เปิดใช้** — ปิดด้วยกลไกที่ปิดได้จริง ดูข้อบน ไม่ใช่ `FeatureService` ตามสภาพปัจจุบัน
      · ตารางนี้ soft delete → **ต้องใส่ `AGGREGATE_CHILDREN` หรือ `ROOTS`** ไม่งั้น cascade test ฟ้อง
      · roadmap ไม่ได้จัด Google login ไว้ phase ไหน — ตอนเปิดใช้จริงค่อยเพิ่มเข้า roadmap

---

## 1. Auth — ทุกอย่างข้างล่างพึ่งข้อนี้

ตารางมีครบแล้วตั้งแต่ Phase 0 (`identity.sessions`, `password_reset_tokens`) · ที่ต้องเขียนคือโค้ด

- [ ] `@nestjs/jwt` + guard เขียนเอง — **ไม่ใช้ `@nestjs/passport`** ([เหตุผล](../docs/01-architecture.md#auth))
- [ ] 🔒 **`AuthGuard` เป็น `APP_GUARD` และใช้ `enterWith` ไม่ใช่ `run`**
      · `canActivate` คืน boolean แล้วจบ scope — `run` ทำให้ controller เห็น context เป็น `null`
      · วัดไว้แล้วใน Phase 0 ว่า `enterWith` รอดข้าม `await` และ 20 request ซ้อนกันไม่รั่วข้าม org
      · **ห้ามเปลี่ยนโครงตรงนี้โดยไม่รันเทสซ้ำ** — ถ้ารั่วคือ cross-org leak ทันที ไม่ใช่บั๊กธรรมดา
- [ ] Guard อ่าน `@Public()` ผ่าน `Reflector` — decorator มีอยู่แล้วใน `shared/route-metadata.ts` **ยังไม่มีใครอ่าน**
- [ ] `@SkipOrgScope()` — endpoint ที่ล็อกอินแล้วแต่ยังไม่ผูก org (เช่น เลือก org)
- [ ] เลิกใช้ `RequestContextMiddleware` เมื่อ guard มาแล้ว — อย่าปล่อยให้ทั้งสองตัวเซ็ต context พร้อมกัน
- [ ] Login / Logout / Refresh rotation — refresh 1 อันใช้ได้ครั้งเดียว หมุนแล้ว**ไม่สร้างแถวใหม่** แค่เปลี่ยน token hash
      · เก็บ chain ทุก generation ไม่คุ้ม — `previous_token_hash` + `rotated_at` ครอบ reuse detection กับ grace window ไว้แล้ว ที่ chain ซื้อเพิ่มคือจับ replay ของ token เก่ามากๆ ซึ่งไม่ได้เกิดบ่อยขึ้นตามจำนวนคน แต่จำนวนแถวโตตามคนเต็มๆ
- [ ] 🔒 **การหมุนต้อง atomic — เงื่อนไขอยู่ใน `UPDATE` ไม่ใช่ `SELECT` ก่อนแล้วค่อยเขียน**

      ```sql
      UPDATE identity.sessions
         SET previous_token_hash = current_token_hash,
             current_token_hash  = $new, rotated_at = now()
       WHERE current_token_hash = $presented AND revoked_at IS NULL
      RETURNING id
      ```

      · `RETURNING` ว่าง = แพ้การแข่ง ต้องตอบ 401 ไม่ใช่หมุนต่อ
      · อ่านก่อนแล้วค่อยเขียนจะทับกันเงียบ ๆ ตอนเปิดสองแท็บแล้ว access token หมดอายุพร้อมกัน
      · **บทเรียนเดียวกับ `OutboxWorker.claim()`** — ตอนนั้น `SELECT ... FOR UPDATE` แล้วค่อย update ทำให้ worker สองตัวส่งอีเมล 23 ฉบับจาก 12 แถว เพราะ `dataSource.query()` รันทีละ statement ใน transaction ของตัวเอง lock เลยหลุดก่อนอ่าน

- [ ] ❓ **`last_used_at` เขียนตอนไหน** — spec ยังไม่ได้บอก และเป็นช่องที่กัดก่อนเพื่อนตอนคนเยอะ
      · เขียนทุก request = **1 write ต่อ request** ไม่ใช่ 1 ต่อ 15 นาที · write amplification สูงกว่าเรื่องหมุน token หลายอันดับ และเป็นตัวที่ทำให้ `sessions` กลายเป็นตารางร้อน
      · ทางเลือก: เขียนแบบ lazy (อัปเดตเมื่อค่าเก่าเกิน N นาที) หรือปล่อยไว้ในชั้น cache ไม่ลง DB ทุกครั้ง
- [ ] เช็ค session ทุก request (cache 30 วิ) — `revoked_at IS NULL` · `expires_at > now` · `user.status='active'`
      · นี่คือสิ่งที่ทำให้ deactivate/logout มีผลเกือบทันที ไม่ต้องรอ token หมดอายุ
      · ชั้นนี้คือจุดที่จะกลายเป็นคอขวดก่อนใครถ้าคนเยอะขึ้นมาก — ไม่ใช่จำนวนแถว · [เงื่อนไขที่จะเอา Redis เข้ามา](../docs/01-architecture.md#redis--queue--ยังไม่มี-และเงื่อนไขที่จะมี) ระบุ "session revocation cache ที่เช็คทุก request" ไว้เป็นหนึ่งในสามข้ออยู่แล้ว
- [ ] 🔒 **Cookie attributes อยู่ที่เดียว** — `httpOnly · Secure · SameSite=Lax` · refresh ตั้ง `path=/api/v1/auth`
      · กระจายไปหลายที่เมื่อไหร่ จะมีตัวใดตัวหนึ่งตกหล่นแบบไม่มีใครเห็น
- [ ] Access token payload มีแค่ `sub` `org` `sid` `exp` — **ไม่ใส่ role** ไม่งั้นถอดสิทธิ์แล้วต้องรอ 15 นาที
- [ ] `GET /api/v1/me` — ชื่อ อีเมล role ดึงจากตรงนี้
- [ ] ลืมรหัสผ่าน (ลิงก์อีเมลอายุ 10 นาที ใช้ได้ครั้งเดียว) / เปลี่ยนรหัสผ่าน (ต้องใส่รหัสเดิม)
- [ ] `/register` มีอยู่แต่ดักด้วย `FeatureService.isEnabled(org, 'public_registration')` → `false`
      · **การใช้งานจริงครั้งแรกของ `FeatureService`** ที่เขียนรอไว้ตั้งแต่ Phase 0

**ตรวจก่อนปิดข้อนี้**

- [ ] token หมดอายุ → 401 ไม่ใช่ 500
- [ ] logout แล้วใช้ access token เดิมต่อ → ถูกปฏิเสธภายใน 30 วินาที (cache TTL)
- [ ] deactivate user ระหว่างที่เขาล็อกอินอยู่ → request ถัดไปเข้าไม่ได้
- [ ] 🔒 request หลายอันจากคนละ org พร้อมกัน → ไม่มีอันไหนเห็น org ผิด

---

## 2. User + Profile

- [ ] 🔒 **Email unique ทั้งระบบแบบ partial index**

      ```sql
      CREATE UNIQUE INDEX ON identity.users (email) WHERE status != 'deleted';
      ```

      · `citext` อยู่แล้ว → `A@x.com` ชนกับ `a@x.com` เอง ไม่ต้องพัน `lower()`
      · `WHERE status != 'deleted'` จองอีเมลไว้ตลอด grace period 30 วัน ไม่ให้คนอื่นแย่งไปสมัครแล้วเจ้าตัวกู้คืนไม่ได้

- [ ] โปรไฟล์: ชื่อจริง · **ชื่อเล่น** · อีเมล · รูป
      · ชื่อเล่นไม่ใช่ของตกแต่ง — คนไทยเรียกชื่อเล่นเป็นหลัก ค้นด้วยชื่อจริงอย่างเดียวหาไม่เจอ
- [ ] อัปโหลดรูปผ่าน `StorageService` (presigned) — เขียนรอไว้แล้ว Phase 1 ใช้จริงครั้งแรก
- [ ] Deactivate / Reactivate (admin/owner กด) — assign งานใหม่ให้ไม่ได้ งานเก่ายังอยู่
- [ ] สร้าง user ช่วงแรกด้วย admin API หรือ seed script — **หน้าจอจัดการ user อยู่ Phase 2**

---

## 3. Organization

- [ ] Role ระดับ org: `owner` / `admin` / `member`
- [ ] **Owner มีได้หลายคน** (โมเดล GitHub ไม่ใช่ Primary Owner แบบ Slack)
- [ ] 🔒 ห้ามลบหรือลดสิทธิ์ owner คนสุดท้าย — ดู §0 เรื่อง test
- [ ] `PermissionService.assert` ต่อเข้ากับ guard ตัวที่สอง — `can()` เขียนไว้แล้วตั้งแต่ Phase 0 ยังไม่มีใครเรียก
      · อย่าลืมว่า `can` บังคับส่ง resource · เวอร์ชันไม่ส่ง resource คือ `isEverAllowedTo()` ใช้ตอนวาดปุ่มเท่านั้น

---

## 4. Project

- [ ] สร้าง / แก้ไข / ลบ project (soft delete)
- [ ] Project member อิสระจากทีม (แบบ Slack channel) — role `admin` / `member`
- [ ] ลบ project → ลูกทั้งต้นไปด้วย ผ่าน `cascadeSoftDelete` ที่มีอยู่แล้ว
      · ถ้าเพิ่มตารางใหม่ใน phase นี้ **ต้องใส่ใน `AGGREGATE_CHILDREN` หรือ `ROOTS`** ไม่งั้น test ฟ้อง

---

## 5. Status (custom ต่อ project)

- [ ] สีเก็บเป็น **token จาก palette 8 สี ไม่ใช่ hex** (`gray` `red` `orange` `yellow` `green` `blue` `purple` `pink`)
- [ ] Default ตอนสร้าง project ใหม่: To do (gray, `is_default`) · In progress (blue) · Done (green, `is_done_type`)
- [ ] `sort_order` เป็น LexoRank เหมือน task
- [ ] Partial unique index คุม "อย่างมากหนึ่ง" มีตั้งแต่ Phase 0 แล้ว — `is_default` ต่อ project
- [ ] ห้ามลบ status ที่มี task ใช้อยู่ / ห้ามลบอันสุดท้าย
- [ ] status เป็นทั้ง done และ cancelled พร้อมกันไม่ได้
- [ ] Badge สีอ่อน + ตัวอักษรเข้ม **พร้อมชื่อเสมอ** — คนตาบอดสีประมาณ 8% ของผู้ชาย สีอย่างเดียวไม่พอ

---

## 6. Task

- [ ] CRUD — Title · Description · Due date · Priority
- [ ] **Quick add** — พิมพ์ชื่อ + Enter จบ ไม่บังคับ field อื่น
      · ในหน้า My Tasks มี dropdown เลือก project ข้างช่องพิมพ์ · default = project ที่เพิ่งสร้าง task ล่าสุด (เก็บใน user preference)
      · 🟡 ใน roadmap แต่**ตัดไม่ได้** — quick add คือสิ่งที่ทำให้คนกลับมาใช้
- [ ] Assign ได้หลายคน (เฉพาะ user — ทีมอยู่ Phase 2)
- [ ] จัดลำดับเอง (LexoRank)
- [ ] 🔒 **`completed_at` / `completed_by` สอดคล้องกับ `is_done_type` เสมอ — คุมสองทาง**
  - [ ] ทาง A: task เปลี่ยน status → ตั้งค่า/reset เป็น null
  - [ ] ทาง B: **มีคนแก้ `is_done_type` ของ status ที่มี task ใช้อยู่แล้ว** ← ทางนี้ลืมง่ายกว่ามาก เพราะคนแก้กำลังมองหน้าจอตั้งค่า project ไม่ได้มองงานสักใบ
  - [ ] `CHECK` ทำแทนไม่ได้ เงื่อนไขข้ามตาราง (`tasks` ↔ `statuses`)
- [ ] **Assignee picker** — type-ahead ค้นได้ทั้งชื่อจริง / ชื่อเล่น / อีเมล ไม่ใช่ dropdown รายชื่อยาว
      · เรียง: คนใน project → คนที่เพิ่ง assign ล่าสุด (จาก activity log) → ที่เหลือทั้ง org
      · เลือกคนนอก project → ถามว่าเพิ่มเข้า project เลยไหม
      · แสดง avatar + ชื่อ + ชื่อเล่นทุกแถว (กันเลือกผิดคน — บริษัท 100 คนมีชื่อซ้ำแน่)
      · 🟡 แต่ตัดไม่ได้เหมือน quick add

---

## 7. Activity log — ต่อของที่มีอยู่แล้ว

- [ ] 🔒 **`AuditService.record(manager, entry)` ใน transaction เดียวกับ business logic**
      · service throw ให้เองถ้าไม่มี transaction เปิดอยู่ — เป็นการบังคับด้วยรูปทรง ไม่ใช่ความจำ
      · event listener ทำแทนไม่ได้ มันรันหลัง commit
- [ ] เขียน log ตอน: สร้าง/แก้/ลบ task · เปลี่ยน status · assign · เปลี่ยน role · login ล้มเหลว
- [ ] Assignee picker ข้อ "คนที่เพิ่ง assign ล่าสุด" อ่านจาก log นี้ — ออกแบบ `metadata` ให้ query ได้ตั้งแต่แรก

---

## 8. Notification

ของหลังบ้านเสร็จหมดแล้วตั้งแต่ Phase 0 (`EmailService` + outbox + worker + retry + Sentry alert) · ที่เหลือคือ template กับจุดเรียก

- [ ] อีเมลเมื่อถูก assign งาน
- [ ] `EmailService.enqueue(manager, …)` รับ transaction ของ caller เหมือน `AuditService`
      · assign สำเร็จแต่อีเมลไม่ออก = คนไม่รู้ว่ามีงาน · อีเมลออกแต่ assign rollback = แย่กว่า
- [ ] Template ที่ยังไม่ implement **ไม่ throw** — ส่งแบบดิบไปก่อน ไม่งั้นวนใน retry loop จนถูก mark failed
- [ ] ตั้ง `RESEND_API_KEY` จริงบน production (ไม่มี = boot ไม่ผ่านอยู่แล้ว)

---

## 9. List view + My Tasks

- [ ] **List view รับ config คอลัมน์เป็น array จากที่เดียว** (hard-code ไว้ก่อนได้)
      · ห้ามเขียน `<th>` ตายตัวใน JSX — Phase 4 ต่อ `view.columns` จะได้แก้จุดเดียว
- [ ] Filter: คน · status · priority · วันที่ · **งานของคนที่ inactive**
      · ข้อสุดท้ายไม่ใช่ของแถม ถ้าไม่มี งานจะค้างอยู่กับคนที่เข้าระบบไม่ได้แล้วโดยไม่มีใครเห็น
- [ ] Search พื้นฐาน
- [ ] **My Tasks** — Phase 1 มีแค่งานที่ assign ให้ตัวเอง
- [ ] 🔒 **Pagination เป็น cursor ไม่ใช่ offset**
      · `OrgScopedRepository` ตัด `skip` ออกจาก type แล้ว (`ScopedFindManyOptions`) — เขียน offset ไม่ผ่าน compile
      · เหตุผล: `sort_order` เป็น LexoRank แทรกกลางได้ → page ถัดไปซ้ำแถวเดิมหรือข้ามแถว
      · **ต้องเขียน cursor helper ใน `shared/`** เป็นงานจริงของ phase นี้ ไม่ใช่ของที่มีอยู่แล้ว

---

## 10. API surface

- [ ] `/api/v1/*` · path nested ชั้นเดียว · resource พหูพจน์ · แก้ไขใช้ `PATCH`
- [ ] Error shape ตาม [`01-architecture.md`](../docs/01-architecture.md#api) — `code` เป็น string คงที่ให้ frontend เช็ค, `message` ภาษาไทยแสดงผู้ใช้ได้เลย
- [ ] Swagger ครบทุก endpoint — `/docs` เป็นของที่คนอื่นในทีมใช้จริงแล้ว phase นี้
- [ ] zod schema ที่ใช้ร่วมสองฝั่งอยู่ใน `@repo/shared` — อย่า duplicate ฝั่ง web

---

## 11. ปิด Phase 1

- [ ] `yarn build` / `lint` / `check-types` / `test` เขียวหมด
- [ ] 🔒 `org-isolation.spec.ts` ยังไม่มีข้อยกเว้น และครอบ endpoint ใหม่ทั้งหมด
- [ ] `schema-drift.spec.ts` เขียว (ถ้ามี migration ใหม่)
- [ ] Deploy ขึ้น Bangmod แล้วมีคนจริงล็อกอินได้
- [ ] Tag `v1.0.0`

---

## ดักไว้ก่อน — จุดที่เสียเวลาแน่ถ้าไม่รู้

| จุด | เรื่อง |
| --- | --- |
| `enterWith` ใน guard | `run` ใช้ไม่ได้ (scope ปิดก่อน handler) · ถ้าเปลี่ยนโครง auth ต้องรันเทส concurrency ซ้ำ ไม่ใช่แค่ดูว่า login ผ่าน |
| `@Public()` | มีอยู่แล้วแต่**ยังไม่มีใครอ่าน** · ลืมต่อ `Reflector` = ทุก endpoint ต้องล็อกอิน รวมทั้ง `/login` เอง |
| `RequestContextMiddleware` | ต้องเลิกใช้เมื่อ guard มา · ปล่อยไว้ทั้งคู่แล้วจะมีสองที่เซ็ต context ที่ debug ยากมาก |
| `skip` ใน repository | ตัดออกจาก type แล้ว compile ไม่ผ่าน · ไม่ใช่บั๊ก เป็นความตั้งใจ — ต้องเขียน cursor helper |
| `save()` ที่มี `id` | เช็คก่อนว่า org นี้เป็นเจ้าของ ถ้าไม่ใช่ throw · เจอตอนเขียน update endpoint แน่ |
| `updateById` | ไม่โหลด entity → subscriber ไม่ทำงาน · มันเขียน `updatedBy` ให้เองแล้ว อย่าเขียนซ้ำ |
| Audit ต้องอยู่ใน transaction | `AuditService.record` throw ถ้าไม่มี · ไม่ใช่ความจำ เป็นรูปทรง |
| Cookie `SameSite=Lax` | พอได้เพราะ Caddy รับ origin เดียว · **ห้ามยุบเป็น `api.domain.com`** ไม่งั้นต้องมี CSRF token ทั้งระบบ |
| Email `citext` | unique index ต้องเป็น partial (`WHERE status != 'deleted'`) ไม่งั้นลบ user แล้วอีเมลนั้นสมัครใหม่ไม่ได้ตลอดกาล |
| ชื่อเล่น | ค้นต้องครอบทั้งชื่อจริง ชื่อเล่น อีเมล · ทำ index ตั้งแต่แรก บริษัท 100 คน `ILIKE '%x%'` ยังไหว แต่ 1000 ไม่ไหว |
| LexoRank | แทรกกลางได้ = offset pagination พัง · และ `text COLLATE "C"` เท่านั้น ถ้าใช้ collation อื่นลำดับจะเพี้ยน |
| `is_done_type` แก้ทีหลัง | ทาง B ใน §6 — ลืมแล้วจะมี task ที่ `completed_at` มีค่าแต่ status ไม่ใช่ done โดยไม่มีอะไรฟ้อง |
| Estimate | roadmap เขียน ~6 สัปดาห์ · Auth (§1) กินเวลามากกว่าที่คิดเสมอ ถ้าจะตัดให้ตัด §9 filter ย่อย อย่าตัด test ใน §0 |
