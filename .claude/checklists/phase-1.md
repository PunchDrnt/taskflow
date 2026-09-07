# Phase 1 — แกนหลัก `v1.0.0`

ไล่ตามลำดับที่ทำได้จริง (ไม่ใช่ลำดับ priority ใน [`03-roadmap.md`](../docs/03-roadmap.md)) — ข้อล่างพึ่งข้อบน

> **สถานะไฟล์นี้:** ของชั่วคราว ไม่ใช่ spec · ตัวสเปกจริงอยู่ที่ [`.claude/docs/`](../docs/) — ถ้าขัดกัน ให้เชื่อ docs
>
> 🔒 = [binding decision](../docs/00-overview.md#binding-decisions) ผิดแล้วแก้ย้อนหลังไม่ได้
> ❓ = ยังไม่ตัดสิน ต้องเลือกก่อนถึงจะทำข้อนั้นได้

**Phase 1 คือแกนที่ทุก phase ถัดไปต่อยอด** — ตัวตน · องค์กร · โปรเจกต์ · งาน
· เส้นที่ปล่อยให้คนใช้จริงอยู่ท้าย [Phase 3](../docs/04-features/phase-3.md) ไม่ใช่ตรงนี้
แต่ของที่ผิดตรงนี้จะแพงที่สุดเพราะทุกอย่างวางทับมันหมด

---

## Schema ลงแล้ว

ทุกคอลัมน์และทุกตารางที่ Phase 1-3 ต้องใช้ **ลงครบแล้ว** ในรอบเดียว ไม่ต้องแตะ migration อีก
จนกว่าจะถึง RLS ของ Phase 2 — lockout · `invitations` · `notifications` · `color` ·
`key_prefix` · `next_task_number` · `archived_at` · `stale_after_days` · `tasks.number` +
unique เต็ม · `views.sort_order` / `is_default`

ข้อที่เหลือข้างล่างจึงเป็น **โค้ดกับหน้าจอล้วน** ยกเว้นที่เขียนกำกับไว้เป็นอย่างอื่น

---

## 0. ยกมาจาก Phase 0

ของที่รู้ตัวแล้วว่าค้าง ไม่ใช่ของที่เพิ่งคิดได้

- [ ] **Branch protection บน `main`** — บังคับ PR + CI เขียว ห้าม push ตรง
      · ไม่ใช่เรื่องความเรียบร้อย: `deploy.yml` ไม่รัน test เลย มันเชื่อว่า gate รันบน `main` ไปแล้ว
      · push ตรงเข้า main ได้ = ของที่ไม่เคยผ่านอะไรขึ้น production ได้ ([ผัง](../docs/01-architecture.md#branching))
- [ ] **CI trigger `push: [main]`** — comment ไว้ใน `ci.yml` พร้อมเงื่อนไขปลดล็อกว่า _"Put this back once work arrives through pull requests"_ · **เงื่อนไขนั้นสำเร็จไปแล้ว** (Phase 0 จบ งานเข้าทาง PR ตั้งแต่ #2) เหลือแค่กด
      ช่องที่มันปิดคือ merge commit ที่ต่างจาก PR head · เปิด branch protection แบบ require up-to-date แทนก็ได้ เลือกอย่างใดอย่างหนึ่ง ไม่ต้องทำทั้งคู่
- [ ] 🔒 **Test invariant ที่ DB บังคับเองไม่ได้** — Phase 0 เลื่อนมาเพราะยังไม่มี service ให้บังคับ **Phase 1 มีแล้ว หมดข้ออ้าง**
  - [x] org ต้องมี `role='owner'` ≥1 แถวเสมอ (ห้ามลบ/ลดสิทธิ์คนสุดท้าย) — `test/organization.spec.ts` รวมเคสถอดพร้อมกันสองอัน
  - [x] project ต้องมี `is_done_type` ≥1 อัน — `test/status.spec.ts` ปฏิเสธทั้งการลบและการเปลี่ยน kind ของอันสุดท้าย
        · ถ้าไม่มีเลย = ไม่มีอะไรใน project นั้นถูกนับว่าเสร็จได้อีกเลย และตัวเลข progress ทุกอันอ่านเป็นศูนย์ตลอดไปโดยไม่มี error
  - [ ] `completed_at`/`completed_by` มีค่า **ก็ต่อเมื่อ** status ของ task นั้น `is_done_type` — คุมสองทาง ดู §6
- [x] 🔒 **`FeatureService.isEnabled()` เคย return `true` เสมอ — "ดักด้วย feature flag" จึงแปลว่า "เปิดอยู่"**
      · [`04-features/phase-1.md`](../docs/04-features/phase-1.md#auth--users) เขียนว่า `/register` ดักด้วย `isEnabled(org, 'public_registration')` "ซึ่ง return `false` ตั้งแต่บรรทัดแรก" — โค้ดตอนนั้น `return true`
      · ใครสร้าง `/register` ตามสเปกโดยไม่เปิดไฟล์ดู จะได้ public registration ที่เปิดอยู่ = ใครรู้ URL ก็สมัครเข้ามาแล้วรอให้ใครสักคนเผลอเพิ่มเข้า org
      · **ตัดสินแล้ว: allow-list ว่าง ปิดหมดเป็น default** — `ENABLED_FEATURES` เป็น `Set` เปล่า ชื่อที่ไม่ได้อยู่ในนั้นคือปิด · การเพิ่มชื่อเข้า `FEATURES` จึงเป็นการ**ดัก** feature ไม่ใช่การเปิด
      · doc ไม่ต้องแก้ — **โค้ดขยับมาตรงกับ doc** ไม่ใช่ทางกลับกัน
      · test ครอบว่าไม่มี feature ไหนเปิดอยู่จริง และชื่อที่ยังไม่มีใครเปิด return `false` — ไม่ใช่เชื่อคอมเมนต์
- [ ] **`iam.oauth_accounts` — migrate ไว้ แต่ feature ปิด ยังไม่ใช้** (ตัดสินแล้ว)
      · ตารางลงตาม schema ใน [`02-database/schema.md`](../docs/02-database/schema.md#schema-iam) · เป็นแพทเทิร์นเดียวกับ `iam.roles`/`permissions` ที่ migrate ตั้งแต่ Phase 0 แล้วไม่มีใครอ่านจนถึง Phase 7
      · **Google login ยังไม่เปิดใช้** — ปิดด้วยกลไกที่ปิดได้จริง ดูข้อบน ไม่ใช่ `FeatureService` ตามสภาพปัจจุบัน
      · **hard delete** (`CreatedEntity`) ตามสามคำถามใน [`02-database/rules.md`](../docs/02-database/rules.md#base-entity) — ลืม `deleted_at IS NULL` ใน flow ล็อกอินคือช่องให้คนที่ unlink แล้วเข้ากลับมาได้ · จึงไม่ต้องแตะ `AGGREGATE_CHILDREN`/`ROOTS` เลย และ index เป็น `UNIQUE` ธรรมดาไม่ใช่ partial
      · 🔒 **anonymise ต้อง `DELETE` แถว oauth เอง** — `ON DELETE CASCADE` บน `user_id` ไม่ยิง เพราะ `iam.users` อยู่ใน `NEVER_PURGED` และ anonymise เป็น `UPDATE` · ไม่ลบ = แถวค้างให้ล็อกอินกลับเข้ามาได้
      · roadmap ไม่ได้จัด Google login ไว้ phase ไหน — ตอนเปิดใช้จริงค่อยเพิ่มเข้า roadmap

---

## 1. Auth — ทุกอย่างข้างล่างพึ่งข้อนี้

ตารางมีครบแล้ว (`iam.sessions` · `password_reset_tokens` ตั้งแต่ Phase 0 ·
`failed_login_attempts` / `locked_until` ลงแล้วใน [schema batch](#schema-ลงแล้ว)) · ที่เหลือคือโค้ดล้วน

- [x] `@nestjs/jwt` + guard เขียนเอง — **ไม่ใช้ `@nestjs/passport`** ([เหตุผล](../docs/01-architecture.md#auth))
- [x] 🔒 **`AuthGuard` เป็น `APP_GUARD` และเปิด context ด้วย `openRequestContext()` ก่อน `await` แรก**
      · `canActivate` คืน boolean แล้วจบ scope — `run` ทำให้ controller เห็น context เป็น `null`
      · ⚠️ **แก้แล้วหลังยิง server จริง (2026-09-04)** — เวอร์ชันแรกเรียก `enterWith` _หลัง_ await (ต้อง query session ก่อนถึงจะรู้ org)
      แล้ว `POST /v1/me/active-org` คืน 500 `No request context` · store ที่เข้าหลัง `await` ลงบน promise resource ที่ handler ไม่สืบมา
      · **อาการไม่คงที่** — request แรกของ connection ถูก, request ที่ 3 ไม่ถูก · ยิงมือทีละครั้งจะดูเหมือนผ่าน
      · เทสต์เดิมไม่จับเพราะเรียก `enterWith` ตรงๆ ใน request handler ไม่ได้แยกเป็น `guard()` ที่ถูก `await` แบบ Nest — ระยะ async หนึ่งชั้นนั้นคือทั้งหมดของบั๊ก
      · ท่าที่ถูก: จอง slot (`enterWith` cell เปล่า) ในส่วนหัวที่ยังไม่เจอ `await` แล้วเติมค่าทีหลัง
      — วัดแล้วถูกทั้ง 40 request ขนานและ 10 request ต่อเนื่องบน keep-alive เส้นเดียว
      · ⚠️ harness ในโปรเซสเดียวไม่ใช่ตัวแทนที่ถูก (`AsyncResource` ซ้อนกันสืบ store ตัวนอกมา) — `auth.guard.spec.ts` จึง assert ที่ call ไม่ใช่ที่ store
      · **ห้ามเปลี่ยนโครงตรงนี้โดยไม่ยิง server จริงซ้ำ** — unit test ผ่านหมดตอนที่ guard พังอยู่ · ถ้ารั่วคือ cross-org leak ไม่ใช่บั๊กธรรมดา
- [x] Guard อ่าน `@Public()` ผ่าน `Reflector` — decorator มีอยู่แล้วใน `shared/http/route-metadata.ts` **ยังไม่มีใครอ่าน**
- [x] `@SkipOrgScope()` — endpoint ที่ล็อกอินแล้วแต่ยังไม่ผูก org · **Phase 1 มีผู้ใช้จริงสองกลุ่ม**:
      หน้า Home ที่รวมงานข้าม org และคนที่ยังไม่ได้อยู่ org ไหนเลย
- [x] เลิกใช้ `RequestContextMiddleware` เมื่อ guard มาแล้ว — อย่าปล่อยให้ทั้งสองตัวเซ็ต context พร้อมกัน
- [x] Login / Logout / Refresh rotation — refresh 1 อันใช้ได้ครั้งเดียว หมุนแล้ว**ไม่สร้างแถวใหม่** แค่เปลี่ยน token hash
      · เก็บ chain ทุก generation ไม่คุ้ม — `previous_token_hash` + `rotated_at` ครอบ reuse detection กับ grace window ไว้แล้ว ที่ chain ซื้อเพิ่มคือจับ replay ของ token เก่ามากๆ ซึ่งไม่ได้เกิดบ่อยขึ้นตามจำนวนคน แต่จำนวนแถวโตตามคนเต็มๆ
- [x] 🔒 **การหมุนต้อง atomic — เงื่อนไขอยู่ใน `UPDATE` ไม่ใช่ `SELECT` ก่อนแล้วค่อยเขียน**

      ```sql
      UPDATE iam.sessions
         SET previous_token_hash = current_token_hash,
             current_token_hash  = $new, rotated_at = now()
       WHERE current_token_hash = $presented AND revoked_at IS NULL
      RETURNING id
      ```

      · `RETURNING` ว่าง = แพ้การแข่ง ต้องตอบ 401 ไม่ใช่หมุนต่อ
      · อ่านก่อนแล้วค่อยเขียนจะทับกันเงียบ ๆ ตอนเปิดสองแท็บแล้ว access token หมดอายุพร้อมกัน
      · **บทเรียนเดียวกับ `OutboxWorker.claim()`** — ตอนนั้น `SELECT ... FOR UPDATE` แล้วค่อย update ทำให้ worker สองตัวส่งอีเมล 23 ฉบับจาก 12 แถว เพราะ `dataSource.query()` รันทีละ statement ใน transaction ของตัวเอง lock เลยหลุดก่อนอ่าน

- [x] **`last_used_at` เขียนแบบ lazy — เฉพาะตอนค่าเก่าเกิน 5 นาที** (ปิด ❓ แล้ว)
      · เขียนทุก request = **1 write ต่อ request** ไม่ใช่ 1 ต่อ 15 นาที · write amplification สูงกว่าเรื่องหมุน token หลายอันดับ และเป็นตัวที่ทำให้ `sessions` กลายเป็นตารางร้อน
- [x] เช็ค session ทุก request (cache 30 วิ) — `revoked_at IS NULL` · `expires_at > now` · `user.status='active'`
      · นี่คือสิ่งที่ทำให้ deactivate/logout มีผลเกือบทันที ไม่ต้องรอ token หมดอายุ
      · ชั้นนี้คือจุดที่จะกลายเป็นคอขวดก่อนใครถ้าคนเยอะขึ้นมาก — ไม่ใช่จำนวนแถว · [เงื่อนไขที่จะเอา Redis เข้ามา](../docs/01-architecture.md#redis--queue--ยังไม่มี-และเงื่อนไขที่จะมี) ระบุ "session revocation cache ที่เช็คทุก request" ไว้เป็นหนึ่งในสามข้ออยู่แล้ว
- [x] 🔒 **Cookie attributes อยู่ที่เดียว** — `httpOnly · Secure · SameSite=Lax · Path=/` ทั้งสี่ตัว
      · กระจายไปหลายที่เมื่อไหร่ จะมีตัวใดตัวหนึ่งตกหล่นแบบไม่มีใครเห็น
      · ⚠️ **`refresh_token` กับ `two_factor_challenge` เคยเป็น `path=/api/v1/auth` — ขยายเป็น `/` แล้วหลังยิงจริง 2026-09-07**
      cookie ที่ผูก path ไม่ถูกส่งมากับ request ของหน้าเว็บ ฉะนั้น `proxy.ts` กับ Server Action ไม่มี token จะต่ออายุ session เลย
      · อาการ: cold load ที่ห่างเกิน 15 นาที render เป็น signed-out ทั้งที่ refresh token ยังดีอีก 15 วัน (วัดแล้ว TTL 20 วิ รอ 24 วิ → 401 · เปลี่ยนเป็น `/` → 200)
      · แก้ [`01-architecture.md#auth`](../docs/01-architecture.md#auth) ใน commit เดียวกัน · unit test ปักไว้แล้วว่าเป็น `/` ทั้งสี่ ถ้าใครหดกลับจะแดง
- [x] Access token payload มีแค่ `sub` `sid` `exp` — **ไม่ใส่ role และไม่ใส่ org**
      · เหตุผลเดียวกันทั้งคู่: ถอดสิทธิ์/ถอดคนออกจาก org แล้วต้องรอ 15 นาที
      · และตั้งแต่หนึ่งคนอยู่ได้หลาย org ค่าเดียวใน token ก็ตอบไม่ได้อยู่ดี ([ทั้งหมด](../docs/01-architecture.md#org-ไหนของ-request-นี้))
- [x] **org ของ request มาจาก cookie `active_org` ที่ตรวจกับ membership ทุกครั้ง**
      · cookie เป็น*ตัวเลือก* ไม่ใช่*สิทธิ์* — แก้ cookie แล้วได้ 403 ไม่ใช่ข้อมูล org อื่น
      · ไม่ได้อยู่ org ไหนเลย → `orgId` เป็น `null` แต่ login ผ่าน · route ที่ต้องใช้ org ตอบ 403 `NO_ORGANIZATION`
      · อยู่หลาย org แต่ยังไม่ได้เลือก → 403 `ORG_NOT_SELECTED` **คนละ code กัน** เพราะต้องการคนละหน้าจอ
      · cookie ที่ชี้ org ที่ไม่ได้เป็นสมาชิก → 403 แล้ว**ลบ cookie ทิ้ง** ไม่ใช่แค่ปฏิเสธ
      · code ที่ตอบคือ `ORG_NOT_SELECTED` ไม่ใช่การเงียบๆ เปลี่ยนไปใช้ org อื่นที่เขาเป็นสมาชิก — ตอบแทน org ที่ client ไม่ได้ขอคือทางที่งานไปโผล่ผิดบริษัท · พอ cookie ถูกลบแล้ว request ถัดไปก็แก้ตัวเองได้
      · ✅ `RequestContext.orgId` เป็น `string | null` แล้ว · อะไรที่แตะข้อมูล org ใช้ `requireOrgContext()` ซึ่ง throw ถ้าเป็น null (5 call site, compiler หาให้ครบ)
- [x] `GET /v1/me` — ชื่อ อีเมล role · พร้อม `PATCH /v1/me` แก้โปรไฟล์ · ทั้งคู่ `@SkipOrgScope()`
      เพราะคนที่ยังไม่อยู่ org ไหนก็ต้องอ่านและแก้โปรไฟล์ตัวเองได้
      · **`email` ไม่อยู่ในฟอร์มแก้ไข** — เป็นตัวล็อกอินและ unique ทั้งระบบ ต้องยืนยันที่อยู่ใหม่ก่อน ซึ่งเป็น flow ของ Phase 2
- [x] ลืมรหัสผ่าน (ลิงก์อีเมล **อายุ 30 นาที เก็บเป็น env var** ใช้ได้ครั้งเดียว) / เปลี่ยนรหัสผ่าน (ต้องใส่รหัสเดิม)
      · `POST /v1/auth/forgot-password` ตอบ **204 เสมอ** ไม่ว่าอีเมลจะมีจริงหรือไม่ — ต่างกันเมื่อไหร่คือช่องให้ไล่เดาว่าใครมีบัญชี
      · `reset-password` revoke **ทุก** session ไม่เว้นอันไหน · `PATCH /v1/me/password` revoke ทุกอัน **ยกเว้นอันปัจจุบัน**
      ความไม่สมมาตรนี้คือตัวดีไซน์: เตะตัวเองออกด้วยแล้วหน้าจอเด้งไป login ซึ่งอ่านแล้วเหมือนทำไม่สำเร็จ
      · 🔒 ใช้ token แล้วทิ้งด้วย **statement เดียว** แบบเดียวกับ session rotation — `SELECT` แล้วค่อย `UPDATE` แปลว่าคลิกสองทีผ่านทั้งคู่
      · `PASSWORD_RESET_TTL_MINUTES` / `PASSWORD_RESET_MAX_PER_HOUR` อยู่ใน `env.ts` · ขอใหม่ = อันเก่าใช้ไม่ได้
      · controller ของ `PATCH /v1/me/password` อยู่ใน `auth/` แต่ path เป็น `me/` — `UserModule` import `AuthModule` ไม่ได้ มันวนกลับ
      · ⚠️ **`notify.outbox.org_id` กลายเป็น nullable** เพราะเมลรีเซ็ตเป็นของบัญชี ไม่ใช่ของ org
      แก้ [`00-overview`](../docs/00-overview.md#binding-decisions) กับ [`schema.md`](../docs/02-database/schema.md#schema-notify) แล้วใน commit เดียวกัน
- [x] **Remember me** — เป็นค่าของ `sessions.expires_at` ไม่ใช่กลไกใหม่
- [x] **ล็อกบัญชีเมื่อ login ผิดหลายครั้ง** — `iam.users.failed_login_attempts` + `locked_until`
      · เก็บใน DB ไม่ใช่ memory · ลองผิดระหว่างล็อกไม่ต่อเวลา · อีเมลที่ไม่มีในระบบไม่นับอะไรเลย
      · ✅ ครบแล้ว — `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` อยู่ใน `env.ts` · lock หมดอายุแล้วนับใหม่ (N ครั้งต่อหน้าต่าง) ไม่ใช่สะสมต่อ
- [x] `/register` มีอยู่แต่ดักด้วย `FeatureService.isEnabled(org, 'public_registration')` → `false`
      · **การใช้งานจริงครั้งแรกของ `FeatureService`** ที่เขียนรอไว้ตั้งแต่ Phase 0

- [x] **2FA แบบ TOTP — เปิดเอง ไม่บังคับใคร** (นอกแผนเดิม · roadmap เขียนไว้ว่า Phase หลัง + บังคับ system role)
      · ลงครึ่งแรกก่อนเพราะ**การบังคับต้องมี system role ให้บังคับ** ซึ่ง `iam.user_roles` ยังไม่มีแถวเลยตั้งแต่ Phase 0
      · 🔒 secret เข้ารหัส AES-256-GCM ไม่ใช่เก็บดิบ — `deploy/backup.sh` เขียน dump ลงดิสก์ กุญแจต้องไม่อยู่ใน dump
      · 🔒 `last_used_step` กัน replay — โค้ดอันเดียวใช้ได้ทั้งหน้าต่าง 30 วิ ไม่จำ step = โดนแอบมองครั้งเดียวใช้ได้สองรอบ
      · challenge เป็น JWT 5 นาที มี `purpose` และ**ไม่มี `sid`** — guard ปฏิเสธสองชั้น
      · recovery code 10 อัน เก็บแต่ hash · ตัดด้วย statement เดียวแบบ session rotation
      · **`phone` ไม่เกี่ยวกับ 2FA** — เลือก TOTP ไม่ใช่ SMS เบอร์เป็นข้อมูลโปรไฟล์ล้วนๆ
- [x] ตาราง `iam.oauth_accounts` — migrate แล้ว ยังไม่มีใครอ่าน (แพทเทิร์นเดียวกับตาราง RBAC ตั้งแต่ Phase 0)

**ตรวจก่อนปิดข้อนี้**

- [x] token หมดอายุ → 401 ไม่ใช่ 500
- [x] logout แล้วใช้ access token เดิมต่อ → ถูกปฏิเสธภายใน 30 วินาที (cache TTL)
- [x] deactivate user ระหว่างที่เขาล็อกอินอยู่ → request ถัดไปเข้าไม่ได้
- [x] 🔒 request หลายอันจากคนละ org พร้อมกัน → ไม่มีอันไหนเห็น org ผิด

**§1 ปิดครบแล้ว** — ทุกข้อข้างบนติ๊กหมดแล้ว รวมทั้งสี่ข้อ "ตรวจก่อนปิด"

⚠️ **`setGlobalPrefix('v1')` ลงแล้ว และ health ถูก exclude ไว้** — healthcheck ใน `deploy/compose.yml`
ยิง `127.0.0.1:4001/health/live` ตรงๆ ไม่ผ่าน Caddy · ย้ายเข้า prefix เมื่อไหร่ container จะรายงาน unhealthy
แล้ว `web` กับ `caddy` ไม่ขึ้นเลย · route health ยัง `@Public()` ด้วยเหตุผลเดียวกัน (ยิงมาแบบไม่มี cookie)

---

## 2. User + Profile

- [x] 🔒 **Email unique ทั้งระบบแบบ partial index** — ลงมาตั้งแต่ `CreateIdentityUsers` แล้ว (`users_email_unique`)

      ```sql
      CREATE UNIQUE INDEX ON iam.users (email) WHERE status != 'deleted';
      ```

      · `citext` อยู่แล้ว → `A@x.com` ชนกับ `a@x.com` เอง ไม่ต้องพัน `lower()`
      · `WHERE status != 'deleted'` จองอีเมลไว้ตลอด grace period 30 วัน ไม่ให้คนอื่นแย่งไปสมัครแล้วเจ้าตัวกู้คืนไม่ได้

- [x] โปรไฟล์: ชื่อจริง · **ชื่อเล่น** · รูป — `PATCH /v1/me` · ชื่อเล่นเป็น required เหมือนชื่อจริง
      · ชื่อเล่นไม่ใช่ของตกแต่ง — คนไทยเรียกชื่อเล่นเป็นหลัก ค้นด้วยชื่อจริงอย่างเดียวหาไม่เจอ
      · ⏳ **อีเมลยังแก้ไม่ได้** — ต้องยืนยันที่อยู่ใหม่ก่อนถึงจะเปลี่ยนได้ ยกไป Phase 2 พร้อม flow ยืนยัน
- [ ] อัปโหลดรูปผ่าน `StorageService` (presigned) — เขียนรอไว้แล้ว Phase 1 ใช้จริงครั้งแรก
      · `avatarUrl` รับค่าแล้วใน `PATCH /v1/me` · ที่ยังขาดคือ endpoint ขอ presigned PUT
- [ ] Deactivate / Reactivate (admin/owner กด) — assign งานใหม่ให้ไม่ได้ งานเก่ายังอยู่
- [ ] สร้าง user ช่วงแรกด้วย admin API หรือ seed script — **หน้าจอจัดการ user อยู่ Phase 2**

---

## 3. Organization

- [x] Role ระดับ org: `owner` / `admin` / `member` — [ตารางว่าใครทำอะไรได้](../docs/01-architecture.md#org-role-ทำอะไรได้-และเช็คที่ไหน)
- [x] **Owner มีได้หลายคน** (โมเดล GitHub ไม่ใช่ Primary Owner แบบ Slack)
- [x] 🔒 ห้ามลบหรือลดสิทธิ์ owner คนสุดท้าย — ดู §0 เรื่อง test
      · เงื่อนไขอยู่ใน `UPDATE` ไม่ใช่ `SELECT` นับก่อน · `RETURNING` ว่าง = ถูกปฏิเสธ = `LAST_OWNER`
      · **เคสที่ทำให้ต้องเป็นแบบนี้:** สอง admin ถอด owner สองคนสุดท้ายพร้อมกัน — อ่านเจอ "มี owner สองคน" ทั้งคู่
        ผ่านทั้งคู่ เหลือศูนย์ ไม่มี error ที่ไหน แก้ได้ทางเดียวคือ `UPDATE` มือบน production
      · `test/organization.spec.ts` ยิงสองอันขนานจริงแล้วเช็คว่าเหลือ owner หนึ่งคน
      · **ลบสมาชิกออกจาก org เป็นของ Phase 2** ([ตาราง user states](../docs/04-features/phase-1.md#user-states--three-different-things))
        แต่กติกาอยู่ใน statement เดียวกันแล้ว ตอนเพิ่ม remove จะได้ไม่ต้องเขียนซ้ำ
- [x] `PermissionService.assert` ต่อเข้ากับ guard ตัวที่สอง — `can()` เขียนไว้แล้วตั้งแต่ Phase 0 ยังไม่มีใครเรียก
      · อย่าลืมว่า `can` บังคับส่ง resource · เวอร์ชันไม่ส่ง resource คือ `isEverAllowedTo()` ใช้ตอนวาดปุ่มเท่านั้น
      · ✅ `@RequirePermission(action, 'Organization')` สำหรับ resource ที่รู้จาก context ·
        แถวที่ต้อง load ก่อนเช็คใน service (`PATCH /v1/org/members/:userId`) · `ContextResolvedSubject` กันไว้ที่ type
      · ⚠️ **ผูกกับ route ไม่ใช่ `APP_GUARD`** — มันอ่าน context ที่ `AuthGuard` เติม จึงต้องรันทีหลัง
        และลำดับ global guard ตัดสินโดยลำดับ provider ของ module = ความปลอดภัยทุก route ไปขึ้นกับลำดับ import ใน `app.module.ts`
      · `orgRole` เข้าไปอยู่ใน `RequestContext` แล้ว — guard อ่าน `organization.members` ไปแล้วตอนตัดสินว่า request นี้ของ org ไหน
        เก็บ role ที่เจอมาด้วยเลย ไม่ต้อง query ซ้ำใน controller
- [ ] **หนึ่งคนอยู่ได้หลาย org** — org switcher บนสุดของ sidebar · หน้า Home เป็นปลายทางหลัง login
      ไม่ใช่ project ใด project หนึ่ง · คนที่ยังไม่อยู่ org ไหนเห็นหน้าที่บอกให้ติดต่อ admin
- [x] **สร้าง org มี API ยังไม่มีหน้าจอ** — Phase 1-3 สร้างผ่าน API เท่านั้น
      · `POST /v1/org` · `@SkipOrgScope()` เพราะคนที่สร้าง org แรกยังไม่ได้อยู่ org ไหน
      · org + แถว owner อยู่ใน transaction เดียว — org ที่ไม่มี owner คือสิ่งที่กฎ owner คนสุดท้ายมีไว้กันพอดี
      · audit row เขียนใน context ของ org ที่เพิ่งเกิด ไม่ใช่ของ caller ที่ยังไม่มี org (`org_id` เป็น NOT NULL)
- [ ] ยังไม่ได้ทำ: `DELETE /v1/org` — `ability.ts` เขียนกติกาไว้แล้วว่า owner ลบได้ แต่ยังไม่มี endpoint
      · จงใจ: ไม่มีหน้าจอ ไม่มี flow ยืนยัน และ spec ยังไม่ได้บอกว่าสมาชิกของ org ที่ถูกลบเป็นยังไงต่อ
      · `CascadeSoftDelete` รองรับอยู่แล้ว (`organization.organizations` เป็น ROOT + ลูกประกาศครบ) เหลือแค่ตัดสินใจ
- [x] **ตาราง `organization.invitations`** — ลงแล้ว ยังไม่มีใครอ่าน API + หน้าจอมา Phase 2
      · Phase 1 เพิ่มคนเข้า org ด้วย seed script

---

## 4. Project

- [x] สร้าง / แก้ไข / ลบ project (soft delete)
      · ✅ **สร้างแล้ว** — `POST /v1/projects` สร้าง project + status ตั้งต้น 4 อัน + แถว member ของคนสร้าง **ในทรานแซกชันเดียว**
        `tasks.status_id` เป็น NOT NULL ฉะนั้น project ที่ไม่มี status ไม่ใช่ project ว่าง แต่เป็น project ที่รับงานใบแรกไม่ได้ และดูปกติทุกอย่างจนกว่าจะมีคนลอง
      · ⚠️ **`ability.ts` เคยเขียนกลับข้างกับ docs** — `can('create', 'Project')` อยู่ใน block ของ `member`
        พร้อมคอมเมนต์ว่า "project เป็น Slack channel ใครก็สร้างได้" แต่ [`04-features/phase-1.md`](../docs/04-features/phase-1.md#project) เขียนไว้ตั้งแต่แรกว่า **owner/admin เท่านั้น**
        · ไม่มีใครเห็นเพราะยังไม่เคยมีใครเรียก `can` กับ subject นี้เลย · **โค้ดขยับมาตรงกับ doc** doc ไม่ต้องแก้ (แพทเทิร์นเดียวกับ `FeatureService` ใน §0)
        · เหตุผลของ doc ผูกกับกติกาข้างล่างพอดี: member เห็นเฉพาะ project ที่ตัวเองอยู่ คนที่มองไม่เห็นว่ามีอะไรอยู่แล้วบ้าง ไม่ใช่คนที่ควรตัดสินว่าต้องมีอันใหม่
      · **ไม่มีกฎ "project admin คนสุดท้าย"** ต่างจาก owner คนสุดท้ายของ org — project ที่ไม่เหลือ admin เลย org owner/admin ยังจัดการได้อยู่ จึงเข้าถึงไม่ได้แบบ org ไร้ owner ไม่ได้
- [ ] **`key_prefix` บังคับกรอกตอนสร้าง** · uppercase `^[A-Z][A-Z0-9]{1,5}$` · ซ้ำกันได้ในหนึ่ง org
      · คอลัมน์ + CHECK ลงแล้ว เหลือฟอร์มกับ validation ฝั่ง API/web · **regex ตาม docs ไม่ใช่ตาม prototype**
        (prototype ยอมให้ `12` ผ่าน ซึ่งตัวแรกต้องเป็นตัวอักษร)
      · ✅ `keyPrefixSchema` ใน `@repo/shared` ใช้ regex ของ docs ตรงกับ CHECK ในตาราง — ค่าที่ API รับแต่ DB ปฏิเสธจะโผล่มาเป็น 500
      · schema `.toUpperCase()` ให้เอง — พิมพ์ `apl` มาได้ `APL` ไม่ใช่ 400 (ยิงจริงแล้ว)
      · ⏳ **ติ๊กไม่ได้เพราะยังไม่มีฟอร์มฝั่ง web** — ฝั่ง API ครบแล้ว
- [ ] `color` เป็น token จาก palette 8 สี (ไม่ใช่ hex) — คอลัมน์ลงแล้ว `icon` เอาออกแล้ว
      · ✅ `paletteColorSchema` อ่านจาก `STATUS_COLORS` ตัวเดียวกับ status — ลิสต์เดียว สีที่ project ใช้ได้แต่ status ใช้ไม่ได้จึงเป็นไปไม่ได้
      · ⏳ **ติ๊กไม่ได้เพราะยังไม่มีตัวเลือกสีฝั่ง web** — ฝั่ง API ครบแล้ว (hex ตอบ 400)
- [x] Project member อิสระจากทีม (แบบ Slack channel) — role `admin` / `member`
      · `GET/POST /v1/projects/:id/members` · `PATCH|DELETE .../:userId` · ชื่อดึงผ่าน `UserService.findByIds` ไม่ใช่ join (แบบเดียวกับ org members)
      · 🔒 **ต้องเช็คเองว่าคนที่เพิ่มอยู่ใน org จริง — FK ไม่ได้ครอบ** · `project.members.user_id` ชี้ `iam.users(id)` เดี่ยวๆ
        มีแค่ `project_id` ที่เป็น composite กับ `org_id` · แปลว่าใส่ user ของบริษัทอื่นเข้าไป insert ผ่านสบายๆ แล้วเขาได้ membership จริงที่ `list` นับให้ด้วย
        · `ProjectMemberService.add` เลยถาม `MemberService.findByUserId` ก่อน (export เพิ่มจาก `OrganizationModule`) → ไม่อยู่ใน org = 404
      · ลบสมาชิกเป็น **hard `DELETE`** ถูกแล้ว — `project.members` เป็น `OrgScopedEntity` ไม่มี `deleted_at`
        เพราะ membership ที่จบไปแล้วไม่มีอะไรให้อ่านย้อน · งานที่เขาทำอยู่บน task ผูกด้วย `created_by` ไม่ได้หายไปไหน
      · audit row เขียน**ก่อน** delete ในทรานแซกชันเดียวกัน — เขียนทีหลังจะหาแถวไม่เจอแล้ว
- [x] 🔒 **กั้นสิทธิ์ระดับ project จริงตั้งแต่ phase นี้ ไม่ใช่แค่ซ่อนใน sidebar**
      · member เห็นเฉพาะ project ที่ตัวเองเป็นสมาชิก · org owner/admin เห็นทุก project ใน org ตัวเอง
      · กั้นแค่ที่ UI = คนที่รู้ URL ก็ยังเปิดเข้าไปได้
      · ✅ **กั้นใน SQL** — `ProjectService.list` ให้ org member `INNER JOIN project.members` ส่วน owner/admin ไม่ join
        · กรองทีหลัง = แถวถูกส่งออกไปแล้ว
      · ⚠️ **เจอรูตอนเขียน test: `ability.ts` ให้ member `can('read', 'all')` เฉยๆ** ซึ่งแปลว่าอ่าน project ไหนก็ได้
        ขัดกับ [ตารางใน docs](../docs/01-architecture.md#project-role-เห็นอะไร-และกั้นที่ไหน) · เติม `cannot('read','Project')`
        กับ `cannot('read','Task')` แล้วคืนเป็นราย project จาก `actor.projectRoles` (CASL ใช้กฎตัวท้ายสุดที่ match)
        · **ไม่มีใครเห็นเพราะยังไม่มีใครเรียก** — `findVisible` ที่เขียนใหม่ถาม `can()` แล้วได้ `true` เสมอ เช็คที่ดูเหมือนเช็คแต่ไม่ใช่
      · 🔒 **กฎนี้อยู่สองที่ (SQL กับ CASL) เลี่ยงไม่ได้** — `can()` ตอบเรื่องแถวเดียว ลิสต์ต้องการ `WHERE`
        · `test/project.spec.ts` เช็คว่าทุก role ผลของ `list()` เท่ากับเซตที่ `can('read','Project',{id})` ตอบว่าได้ · แก้ข้างเดียวแล้วแดง
      · **มองไม่เห็น = 404 · เห็นแต่ทำไม่ได้ = 403** — 403 บน project ที่ member ไม่ได้อยู่ = ยืนยันว่ามี id นั้นใน org
      · `actor.projectRoles` ใส่ทีละ project ที่ service โหลดมาแล้ว **ไม่ได้โหลดทั้งหมดใส่ context** — guard ไม่ต้องแตะ
        และไม่มี query เพิ่มต่อ request สำหรับ endpoint ที่ไม่ได้ถามเรื่อง project
- [x] ลบ project → ลูกทั้งต้นไปด้วย ผ่าน `CascadeSoftDelete` (inject เป็น service) ที่มีอยู่แล้ว
      · ถ้าเพิ่มตารางใหม่ใน phase นี้ **ต้องใส่ใน `AGGREGATE_CHILDREN` หรือ `ROOTS`** ไม่งั้น test ฟ้อง
      · ⚠️ **การใช้งานจริงครั้งแรกของ `CascadeSoftDelete`** (เขียนไว้ตั้งแต่ Phase 0 มีแต่ test เรียก) และเจอว่ามันเปิด transaction ของตัวเอง
        ซึ่งแปลว่าเขียน audit row ให้อยู่ทรานแซกชันเดียวกันไม่ได้เลย — ขัดกฎ 🔒
        · เปลี่ยนเป็น `softDelete(manager, table, id)` **บังคับรับ manager และ throw ถ้าไม่มี transaction** ทรงเดียวกับ `AuditService.record`
        · compiler หา call site ให้ครบ 8 จุด · แก้ [`CLAUDE.md`](../CLAUDE.md) ในคอมมิตเดียวกัน
      · audit row บันทึกว่าอะไรไปด้วยกี่แถว (`cascaded`) — log ตอบ "แล้ว task ล่ะ" ได้โดยไม่ต้องไปไล่ `AGGREGATE_CHILDREN` เอง
      · **archive ไม่ใช่ delete** — `POST|DELETE /v1/projects/:id/archive` แยก endpoint ไม่ใช่ field ใน `PATCH`
        เพราะ "เปลี่ยนชื่อ" กับ "ซ่อนจาก sidebar ทุกคน" ไม่ควรมาในรูป request เดียวกันที่ต่างกันแค่หนึ่ง key
        และ activity log ควรมี action ให้คนไล่หา · `archived_at` ไม่มี `archived_by` และไม่มี CHECK คู่ ต่างจาก soft delete ทุกตัว

---

## 5. Status (custom ต่อ project)

- [x] สีเก็บเป็น **token จาก palette 8 สี ไม่ใช่ hex** (`gray` `red` `orange` `yellow` `green` `blue` `purple` `pink`)
      · `paletteColorSchema` ตัวเดียวกับ project — hex ตอบ 400 (ยิงจริงแล้ว)
- [x] Default ตอนสร้าง project ใหม่ **4 อัน**: To do (gray, `is_default`) · In progress (blue) ·
      Done (green, `is_done_type`) · **Cancelled (pink, `is_cancelled_type`)**
      · ลงไปพร้อม §4 — อยู่ทรานแซกชันเดียวกับการสร้าง project เพราะ `tasks.status_id` เป็น NOT NULL
      · Cancelled ต้องมาตั้งแต่ตอนสร้าง เพราะ progress ของ sub-task (Phase 2) ตัดงานยกเลิกออกจากตัวหาร
      ถ้าไม่มี status ที่แปลว่ายกเลิก คนจะเอา Done ไปใช้แทนแล้วตัวเลขเพี้ยนย้อนหลังทั้งหมด
- [ ] **หน้าจอแก้ status ต่อ project** — เพิ่ม/ลบ/เปลี่ยนชื่อ/เปลี่ยนสี/จัดลำดับ
      · กติกาข้างล่างไม่มีที่ให้กดถ้าไม่มีหน้านี้
      · ✅ **API ครบแล้ว** — `GET|POST /v1/projects/:projectId/statuses` · `PATCH|DELETE .../:statusId`
      · แก้ชื่อ/สี/ประเภท/ลำดับ/ตั้งต้น มาใน `PATCH` เดียว เพราะหน้าจอแก้ทั้งหมดนี้ในตารางเดียว
      · ⏳ **ติ๊กไม่ได้เพราะยังไม่มีหน้าจอ** — เป็นงาน web
- [x] `sort_order` เป็น LexoRank เหมือน task
      · **ย้ายด้วย `afterId` ไม่ใช่ส่ง sort key มาเอง** — key เป็นเลขคณิตที่ถูกต้องก็ต่อเมื่ออ่าน neighbour ปัจจุบัน
        client ที่คำนวณจากลิสต์เก่าจะเขียนแถวลงผิดที่โดยไม่มีอะไรฟ้อง · ตัวที่ client รู้จริงคือ "ให้อยู่ต่อจากอันไหน"
      · ตัวที่ถูกย้ายถูกตัดออกจากลิสต์ neighbour ก่อน — ไม่งั้น `between` โดนถามหา key ระหว่างแถวกับตัวมันเอง แล้ว throw
      · ✅ **ตัวช่วยเขียนแล้ว** — `#shared/sort-order` (`between` / `sequence`) · fractional indexing base-62 เรียงตาม ASCII
        ให้ตรงกับ `COLLATE "C"` ของคอลัมน์ · แทรกกลางเขียนแถวเดียว ไม่ใช่เขียนใหม่ทั้งลิสต์
      · 🔒 key ห้ามลงท้ายด้วยหลักต่ำสุด — `'V'` กับ `'V0'` เป็นเลขเดียวกันแต่ไบต์ไม่เท่ากัน ลิสต์ที่มีทั้งคู่คือสองแถวที่คนอ่านแยกไม่ออกแต่ Postgres แยก
- [x] Partial unique index คุม "อย่างมากหนึ่ง" มีตั้งแต่ Phase 0 แล้ว — `is_default` ต่อ project
      · ย้าย default = เคลียร์อันเก่าแล้วตั้งอันใหม่ใน transaction เดียว · สองคำขอพร้อมกันจึง serialise ที่แถวเก่า เหลือหนึ่งเสมอ
      · index เป็น **backstop** ไม่ใช่กลไก — มันทำให้ "มีสอง default" เขียนลง DB ไม่ได้เลย
- [x] ห้ามลบ status ที่มี task ใช้อยู่ / ห้ามลบอันสุดท้าย
      · จำนวน task ถามผ่าน `TaskService.countInStatus` ไม่ได้ query `task.tasks` เอง — คนละ module
        · `TaskModule` เกิดตรงนี้เป็น stub (ยังไม่มี controller) เพราะ §5 ต้องถามสองคำถามเกี่ยวกับ task ก่อนถึงจะลบ/เปลี่ยน kind ได้
      · จำนวนอยู่ใน `details.tasks` ด้วย — หน้าจอจะได้ทำปุ่มจาง + tooltip บอกจำนวนตามสเปก ไม่ใช่กดแล้วค่อยขึ้น error
      · **เพิ่มข้อที่สาม: ห้ามลบอันที่เป็น default** — ไม่ได้อยู่ในสเปกเดิม ตัดสินแล้วบันทึกใน [`04-features/phase-1.md`](../docs/04-features/phase-1.md#status-custom-per-project)
- [x] status เป็นทั้ง done และ cancelled พร้อมกันไม่ได้
      · **API รับ `kind` ตัวเดียวสามค่า ไม่ใช่ boolean สองตัว** — เปิดสองตัวให้ client ส่ง = ส่งคู่ที่ CHECK มีไว้ปฏิเสธได้ แล้วรู้ตัวตอนได้ 500
        · service เป็นคนแปลงเป็นสองคอลัมน์ · บันทึกใน docs แล้ว
- [ ] Badge สีอ่อน + ตัวอักษรเข้ม **พร้อมชื่อเสมอ** — คนตาบอดสีประมาณ 8% ของผู้ชาย สีอย่างเดียวไม่พอ

---

## 6. Task

- [x] CRUD — Title · Description · Due date · Priority
      · priority สี่ระดับจาก `TASK_PRIORITIES` ใน `@repo/shared` · **ไม่มี CHECK ใน DB**
        ไม่มี index ไหนอ่านค่านี้ zod เป็นคนกัน
      · `due_date` บังคับมี offset (`z.iso.datetime({ offset: true })`) — ไม่มี offset = เที่ยงคืน UTC
        ซึ่งเร็วกว่ากรุงเทพ 7 ชม. งานเลยกำหนดตั้งแต่เย็นวันก่อน
      · **project ที่ archive แล้วเขียนไม่ได้** 409 `PROJECT_ARCHIVED` — ตัดสินตอนทำ §6
- [x] **Quick add — เฉพาะในหน้า project** พิมพ์ชื่อ + Enter จบ ไม่บังคับ field อื่น ⏳ หน้าจอยังไม่มี
      · API พร้อมแล้ว: `POST /v1/projects/:id/tasks` รับแค่ `{ title }` · status มาจาก `is_default` ของ project
      · My Tasks ไม่มี quick add · ถ้าเพิ่มทีหลังใช้ `localStorage` จำ project ล่าสุด **ไม่ต้องมีตาราง user preference**
      · 🟡 ใน roadmap แต่**ตัดไม่ได้** — quick add คือสิ่งที่ทำให้คนกลับมาใช้
- [x] 🔒 **Task number + key** — `tasks.number` แจกจาก `projects.next_task_number` ที่เดินหน้าอย่างเดียว
      · **ห้ามใช้ `MAX(number)+1`** — ลบงานบนสุดแล้วเลขถูกแจกซ้ำทันที
      · unique `(project_id, number)` เป็น **index เต็ม ไม่ใช่ partial** — ข้อยกเว้นเดียวของกฎ soft delete
      · key ประกอบตอนแสดงผล (`key_prefix` + `number`) ไม่เก็บสตริงสำเร็จรูป · sub-task มีเลขของตัวเอง
      · ✅ คอลัมน์ + index ลงแล้ว · ✅ `ProjectService.allocateTaskNumber` แจกด้วย
        `UPDATE ... RETURNING` ในทรานแซกชันเดียวกับการ insert — สองคนสร้างพร้อมกัน serialise ที่แถว project
- [x] Assign ได้หลายคน (เฉพาะ user — ทีมอยู่ Phase 2)
      · assign คนนอก project → 409 `NOT_PROJECT_MEMBER` แล้ว client ยิงซ้ำด้วย `addToProject: true`
        (การยืนยันเป็น request ที่สอง ไม่ใช่การเขียนที่ซ่อนอยู่) · ดึงคนเข้า project เป็นสิทธิ์ project admin
      · อีเมลแจ้งคนที่ถูก assign อยู่ §8 ยังไม่ลง
- [x] จัดลำดับเอง (LexoRank) — API รับ `afterId` ไม่ใช่ sort key · เพื่อนบ้านคิด**ในคอลัมน์** ไม่ใช่ทั้ง project
- [x] 🔒 **`completed_at` / `completed_by` สอดคล้องกับ `is_done_type` เสมอ — คุมสองทาง**
  - [x] ทาง A: task เปลี่ยน status → ตั้งค่า/reset เป็น null · `TaskService.update`
        · done อันหนึ่ง → done อีกอันไม่ใช่การปิดครั้งที่สอง เก็บวันเดิม
        · สร้าง task ลงใน done ตรงๆ ก็นับว่าเสร็จทันที (quick add ในคอลัมน์ Done)
  - [x] ทาง B: **มีคนแก้ `is_done_type` ของ status ที่มี task ใช้อยู่แล้ว** ← ทางนี้ลืมง่ายกว่ามาก เพราะคนแก้กำลังมองหน้าจอตั้งค่า project ไม่ได้มองงานสักใบ
        · ลงไปพร้อม §5 เพราะจุดที่ trigger คือ endpoint แก้ status · `TaskService.reconcileCompletion(manager, statusId, counted)`
        · แตะเฉพาะแถวที่ค่าไม่ตรงจริงๆ — งานที่เสร็จอยู่แล้วเก็บวันเดิมไว้ และรันซ้ำไม่เปลี่ยนอะไร
        · `completed_by` ลงชื่อคนที่แก้ status เพราะเขาคือคนที่ทำให้มันเกิด · สองคอลัมน์ขยับพร้อมกันตาม `tasks_completed_pair_check`
  - [x] `CHECK` ทำแทนไม่ได้ เงื่อนไขข้ามตาราง (`tasks` ↔ `statuses`) — ยืนยันแล้วตอนทำทาง B
- [ ] **Assignee picker** — type-ahead ค้นได้ทั้งชื่อจริง / ชื่อเล่น / อีเมล ไม่ใช่ dropdown รายชื่อยาว
      ⏳ หน้าจอยังไม่มี · API ลงแล้ว: `GET /v1/projects/:id/assignable?scope=project|org&q=`
        ค้นชื่อจริง/ชื่อเล่น/อีเมล/username · แต่ละแถวบอก `inProject` ให้ client รู้ว่าต้องถามยืนยันไหม
      · เรียงสองชั้นพอ: **คนใน project → ที่เหลือทั้ง org** · ชั้น "คนที่เพิ่ง assign ล่าสุด"
        ที่สเปกเดิมมี **ตัดออกแล้ว** — เป็น query ที่แพงที่สุดในหน้าจอที่เปิดบ่อยที่สุด
        เพื่อจัดลำดับที่ชั้นแรกตอบได้อยู่แล้วเกือบทุกครั้ง
      · เลือกคนนอก project → ถามว่าเพิ่มเข้า project เลยไหม
      · แสดง avatar + ชื่อ + ชื่อเล่นทุกแถว (กันเลือกผิดคน — บริษัท 100 คนมีชื่อซ้ำแน่)
      · 🟡 แต่ตัดไม่ได้เหมือน quick add

---

## 7. Activity log — ต่อของที่มีอยู่แล้ว

- [x] 🔒 **`AuditService.record(manager, entry)` ใน transaction เดียวกับ business logic**
      · service throw ให้เองถ้าไม่มี transaction เปิดอยู่ — เป็นการบังคับด้วยรูปทรง ไม่ใช่ความจำ
      · event listener ทำแทนไม่ได้ มันรันหลัง commit
- [x] เขียน log ตอน: สร้าง/แก้/ลบ task · เปลี่ยน status · assign · เปลี่ยน role · login ล้มเหลว
      · login ล้มเหลวไม่มี org (endpoint เป็น `@Public()`) แต่ `audit.logs.org_id` เป็น NOT NULL —
        เขียน**หนึ่งแถวต่อ org ที่บัญชีนั้นอยู่** เพราะคนที่ต้องเห็น "มีคนพยายามเข้าบัญชี Kit" คือ admin ของบริษัท Kit
        · บัญชีที่ไม่อยู่ org ไหนเลย ไม่เขียน — ไม่มีใครให้บอก
      · `AuditService.recordFor(manager, { orgId, actorId }, entry)` — org กับ actor เป็น argument
        เฉพาะ event ที่เกิดก่อนมี request context · ที่เหลือทั้งหมดต้องใช้ `record`
      · ⚠️ **เขียนเฉพาะครั้งที่ lockout นับ** — ครั้งที่ยิงตอนกำลังโดนล็อกไม่เขียน เพราะไม่มีเพดาน
        (ยิงได้เร็วเท่าที่เน็ตไหว) และ `audit.logs` เป็นตารางที่ห้ามลบ · ครั้งที่นับถูกจำกัดที่ `LOGIN_MAX_ATTEMPTS` ต่อรอบ
- [x] **อ่านกลับได้** — `GET /v1/tasks/:taskId/activity` ผ่าน `AuditService.findForEntity`
      · ไม่ join `audit.logs` จาก module อื่น · เห็น task ได้ = อ่านประวัติได้ (ไม่มีเงื่อนไขเพิ่ม)
      · ข้อนี้ไม่ได้อยู่ในเช็คลิสต์เดิมซึ่งมีแต่ฝั่งเขียน — activity log ที่ไม่มีใครอ่านได้ไม่ใช่ฟีเจอร์
- [x] เก็บ id ของคนที่ถูก assign ไว้ใน `changes_json` — `entity_id` คือ task ไม่ใช่คน
      และ `audit.logs` ไม่มีคอลัมน์อื่นให้ใส่ ([ทุกคอลัมน์](../docs/02-database/schema.md#schema-audit))
      · index `logs_actor_idx (org_id, actor_id, action, occurred_at DESC)` มีตั้งแต่ Phase 0 แล้ว
        แต่ **ผู้ใช้เดิมของมันคือ assignee picker ชั้นที่สองซึ่งถูกตัดไปแล้ว** — index ยังอยู่ ไม่ต้องลบ

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
- [ ] Filter · sort · group · search — **เก็บสถานะใน URL ไม่ save เป็น view** (view ที่ตั้งชื่อได้อยู่ Phase 4)
      · filter ตาม: คน · status · priority · วันที่
      · filter "งานของคนที่ inactive" **ตัดออกแล้ว** — ถามด้วย filter assignee ธรรมดาได้อยู่แล้ว
        และงานของคนที่ถูก deactivate คาไว้ที่เดิม ไม่ได้หายไปไหน
- [ ] **My Tasks** — Phase 1 มีแค่งานที่ assign ให้ตัวเองโดยตรง · **default ซ่อน done/cancelled**
- [ ] 🔒 **Pagination เป็น cursor ไม่ใช่ offset**
      · `OrgScopedRepository` ตัด `skip` ออกจาก type แล้ว (`ScopedFindManyOptions`) — เขียน offset ไม่ผ่าน compile
      · เหตุผล: `sort_order` เป็น LexoRank แทรกกลางได้ → page ถัดไปซ้ำแถวเดิมหรือข้ามแถว
      · **ต้องเขียน cursor helper ใน `shared/`** เป็นงานจริงของ phase นี้ ไม่ใช่ของที่มีอยู่แล้ว

---

## 10. API surface

- [ ] `/api/v1/*` · path nested ชั้นเดียว · resource พหูพจน์ · แก้ไขใช้ `PATCH`
- [ ] ⚠️ **`setGlobalPrefix('v1')` ไม่ใช่ `'api/v1'` · และต้อง `exclude` health** — บรรทัดเดียวที่ทำ deploy พังได้โดย dev ไม่มีทางเจอ
      · `/api/v1/*` คือ path ที่ **browser** เห็น · Caddy `handle_path /api/*` [ตัด `/api` ทิ้งก่อนถึง Nest](../docs/01-architecture.md#path-ownership) แล้ว ใส่ `'api/v1'` จะได้ `/api/api/v1/...`
      · healthcheck ของ service `api` ยิง `127.0.0.1:4001/health/live` **ตรง ไม่ผ่าน Caddy** — ไม่ exclude แล้ว path กลายเป็น `/v1/health/live` → container unhealthy → `depends_on: service_healthy` บล็อก `web` กับ `caddy` ทั้งกอง
      · dev ไม่เจอเพราะไม่มี Caddy ในเครื่อง · ตอนนี้ `main.ts` ยังไม่มี `setGlobalPrefix` เลย บรรทัดนี้คือของใหม่ที่ phase นี้เพิ่ม
- [ ] Error shape ตาม [`01-architecture.md`](../docs/01-architecture.md#api) — `code` เป็น string คงที่ให้ frontend เช็ค, `message` ภาษาไทยแสดงผู้ใช้ได้เลย
- [ ] Swagger ครบทุก endpoint — `/docs` เป็นของที่คนอื่นในทีมใช้จริงแล้ว phase นี้
- [ ] zod schema ที่ใช้ร่วมสองฝั่งอยู่ใน `@repo/shared` — อย่า duplicate ฝั่ง web

---

## 11. ปิด Phase 1

- [ ] `yarn build` / `lint` / `check-types` / `test` เขียวหมด
- [ ] 🔒 `org-isolation.spec.ts` ยังไม่มีข้อยกเว้น และครอบ endpoint ใหม่ทั้งหมด
- [ ] `schema-drift.spec.ts` เขียว (ถ้ามี migration ใหม่)
- [ ] Deploy ขึ้น Bangmod แล้วล็อกอินได้จริง — **ยังไม่ใช่การเปิดให้ทั้งบริษัทใช้**
      เส้นนั้นอยู่ท้าย Phase 3
- [ ] Tag `v1.0.0`

---

## ดักไว้ก่อน — จุดที่เสียเวลาแน่ถ้าไม่รู้

| จุด | เรื่อง |
| --- | --- |
| `enterWith` ใน guard | `run` ใช้ไม่ได้ (scope ปิดก่อน handler) · และ `enterWith` ต้องอยู่**ก่อน `await` แรก** · ถ้าเปลี่ยนโครง auth ต้องยิง server จริงซ้ำ ไม่ใช่แค่ดูว่า login ผ่าน (login เป็น `@Public()` จึงผ่านแม้ guard พัง) |
| `@Public()` | มีอยู่แล้วแต่**ยังไม่มีใครอ่าน** · ลืมต่อ `Reflector` = ทุก endpoint ต้องล็อกอิน รวมทั้ง `/login` เอง |
| ~~`RequestContextMiddleware`~~ | ✅ ลบไปแล้วพร้อม `AuthGuard` — `openRequestContext` มีที่เรียกที่เดียวคือ guard |
| `null` ใน where ของ TypeORM | ต้องใช้ `IsNull()` · ใส่ `null` ตรงๆ **throw ตอน runtime** ไม่ใช่ compile error — เจอสองรอบใน PR C ทั้งใน service และในเทสต์ |
| `.returning([...])` ของ TypeORM | รับ **property name** เข้า แต่คืน key เป็น **column name** · ชื่อที่ไม่ตรง property ถูกตัดออกจาก SQL **เงียบๆ** ไม่ error — `['id','user_id']` ทำให้ refresh ออก token ที่ไม่มี `sub` แล้วทุก request หลัง refresh 401 (เจอตอนยิงจริง 2026-09-04, unit test ผ่านหมด) |
| `z.uuid()` ของ zod 4 | เช็ค version/variant nibble ตาม RFC 9562 ด้วย · `SYSTEM_USER_ID` (nil UUID) และ id ของ demo seed สอบตก ทั้งที่ column `uuid` ของ Postgres รับหมด — ใช้ `idSchema()` (`z.guid()`) กับทุก id |
| `skip` ใน repository | ตัดออกจาก type แล้ว compile ไม่ผ่าน · ไม่ใช่บั๊ก เป็นความตั้งใจ — ต้องเขียน cursor helper |
| `save()` ที่มี `id` | เช็คก่อนว่า org นี้เป็นเจ้าของ ถ้าไม่ใช่ throw · เจอตอนเขียน update endpoint แน่ |
| `updateById` | ไม่โหลด entity → subscriber ไม่ทำงาน · มันเขียน `updatedBy` ให้เองแล้ว อย่าเขียนซ้ำ |
| Audit ต้องอยู่ใน transaction | `AuditService.record` throw ถ้าไม่มี · ไม่ใช่ความจำ เป็นรูปทรง |
| `setGlobalPrefix` | `'v1'` ไม่ใช่ `'api/v1'` (Caddy ตัด `/api` ไปแล้ว) · ต้อง `exclude` health ไม่งั้น healthcheck ที่ยิงตรงพัง แล้ว compose ไม่ยอมขึ้นทั้ง stack — ดู §10 |
| Cookie `SameSite=Lax` | พอได้เพราะ Caddy รับ origin เดียว · **ห้ามยุบเป็น `api.domain.com`** ไม่งั้นต้องมี CSRF token ทั้งระบบ |
| Email `citext` | unique index ต้องเป็น partial (`WHERE status != 'deleted'`) ไม่งั้นลบ user แล้วอีเมลนั้นสมัครใหม่ไม่ได้ตลอดกาล |
| ชื่อเล่น | ค้นต้องครอบทั้งชื่อจริง ชื่อเล่น อีเมล · ทำ index ตั้งแต่แรก บริษัท 100 คน `ILIKE '%x%'` ยังไหว แต่ 1000 ไม่ไหว |
| LexoRank | แทรกกลางได้ = offset pagination พัง · และ `text COLLATE "C"` เท่านั้น ถ้าใช้ collation อื่นลำดับจะเพี้ยน |
| `is_done_type` แก้ทีหลัง | ทาง B ใน §6 — ลืมแล้วจะมี task ที่ `completed_at` มีค่าแต่ status ไม่ใช่ done โดยไม่มีอะไรฟ้อง |
| Estimate | roadmap ให้ phase นี้ **~4 สัปดาห์** · เป้าหมายรวมคือ **~14 สัปดาห์ถึงจบ Phase 3** ซึ่งเป็นเส้นที่ปล่อยให้คนใช้จริง · Auth (§1) กินเวลามากกว่าที่คิดเสมอ ถ้าจะตัดให้ตัด §9 filter ย่อย อย่าตัด test ใน §0 |
