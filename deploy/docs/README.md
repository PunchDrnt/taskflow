# deploy/

[`deploy/`](../) คือทุกอย่างที่ server รัน และไม่มีอะไรอื่นจาก repo นี้ ·
copy โฟลเดอร์นั้นไปเครื่อง สร้าง `.env` ไว้ข้าง `compose.yml` เท่านั้นจบ —
ตัวแอปมาเป็น image จาก GHCR

เอกสารชุดนี้อยู่ใน `deploy/docs/` ซึ่ง server ไม่ได้ใช้ · ตอน copy ด้วยมือให้ตัดออก
ได้ — `rsync` กับ `tar` มี flag ให้ ส่วน `cp` กับ `scp` ไม่มี:

```bash
rsync -a --exclude docs deploy/ user@server:/srv/taskflow/deploy/
```

server ไม่มี git และไม่มี source ของ repo เลย มีแค่ไฟล์ที่คำสั่งข้างบน copy ขึ้นไป

ตั้ง server ใหม่จากศูนย์ดู [setup.md](setup.md) · เรื่อง SSH key ดู
[ssh-keys.md](ssh-keys.md)

```bash
cd deploy
cp .env.example .env        # แล้วกรอกให้ครบ
docker compose up -d
```

ไม่ต้องใส่ `-f` และไม่ต้องใส่ `--env-file` — `compose.yml` กับ `.env` ที่อยู่ข้างกัน
คือสิ่งที่ `docker compose` อ่านเองอยู่แล้ว

```
deploy/
├─ compose.yml      ตัว stack — มีแค่ caddy ที่ publish port
├─ .env.example     copy เป็น .env ไว้ในโฟลเดอร์เดียวกัน · .env ห้าม commit
├─ config/          mount แบบ read-only · แก้แล้ว `up -d` ใหม่ก็ติด
│  ├─ Caddyfile     origin เดียว: /api/* ไป Nest โดยตัด prefix ทิ้ง
│  └─ garage.toml   object storage
├─ init/            รันครั้งเดียวตอน volume ว่าง · หลังจากนั้นไม่มีผลอีกเลย
│  ├─ postgres.sh   สร้าง role ที่แอปใช้ (ไม่ใช่ superuser)
│  └─ garage.sh     วาง cluster layout, key, bucket
├─ backup.sh        DB กับ object แยกกันคนละโฟลเดอร์
└─ checksum.sh      พิสูจน์ว่าไฟล์บนเครื่องตรงกับ commit ที่ deploy
```

**`config/` กับ `init/` แยกกันเพราะทำงานคนละแบบ** และความต่างนี้ทำให้เสียเวลาหาสาเหตุนาน:
แก้ `config/Caddyfile` แล้ว `up -d` ใหม่ก็มีผลทันที แต่แก้อะไรใน `init/`
ไม่เกิดอะไรขึ้นเลยจนกว่า volume ที่มันไป initialise จะถูกลบ

`deploy/config/garage.toml` กับ `deploy/init/garage.sh` ถูก mount โดย stack ตอน
dev ที่ root ของ repo ด้วย — สองฝั่งเลย drift จากกันไม่ได้

## Why these are committed

ไม่มีไฟล์ไหนมีความลับอยู่ — ทุกค่าเป็น `${VARIABLE}` ที่เติมจาก `.env` ตอนรัน ·
เก็บไฟล์พวกนี้ไว้นอก version control จะปิดบังได้แค่**โครงสร้าง**ของ deployment
ซึ่งไม่ได้ป้องกันอะไรจริง แต่แลกกับการไล่ไม่ได้ว่าอะไรเปลี่ยนไปบ้าง · ตัวที่เป็นความลับ
จริงคือ `.env` และ `.gitignore` ครอบมันอยู่

ที่ไม่ตั้งชื่อว่า `.deploy` ก็ด้วยเหตุผลง่าย ๆ: `cp -R src/*` กับ `tar czf - src/*`
**ข้าม dot-directory เงียบ ๆ ทั้งคู่** และนี่คือโฟลเดอร์ที่มีไว้เพื่อ copy ไป server
โดยเฉพาะ

## Updating

`.github/workflows/deploy.yml` จัดการ **image** ให้ตอน push เข้า `prod` — build,
push ขึ้น GHCR, แล้ว ssh มา `pull` + `up -d`

แต่ **ไฟล์ในโฟลเดอร์นี้มันไม่ได้เอาขึ้นให้** เพราะ server ไม่มี git · เวลาแก้
`compose.yml` หรืออะไรใน `config/` ต้อง `rsync` ขึ้นไปเองก่อน merge เข้า `prod`

ลืมไม่ได้ เพราะทุก deploy จะเทียบ [`checksum.sh`](../checksum.sh) ของฝั่ง repo กับฝั่ง
server ก่อนแตะอะไร ไม่ตรงเมื่อไหร่ deploy หยุดพร้อมบอกว่าต่างกัน — ดังไว้ก่อน
ดีกว่าปล่อยให้ server รัน Caddyfile เก่าเงียบ ๆ

`.env` ไม่อยู่ใน checksum เพราะสองฝั่งต่างกันโดยตั้งใจ · `docs/` ก็ไม่อยู่

deploy เองด้วยมือ หรือย้อนกลับ:

```bash
cd deploy
IMAGE_TAG=<commit-sha> docker compose pull
IMAGE_TAG=<commit-sha> docker compose up -d
```

ไม่ว่า deploy ทางไหน **ของใน `init/` ไม่รันซ้ำ** — มันเห็นแค่ volume ว่างเท่านั้น
