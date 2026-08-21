# Setting up the server

จาก Ubuntu เปล่า ๆ จนถึง deploy ที่วิ่งเองตอน `git push` · ประมาณชั่วโมงนึง
ส่วนใหญ่คือรอ

เรื่อง SSH key แยกไปอยู่ [SSH-KEYS.md](SSH-KEYS.md) เพราะมี key สามดอกและสองดอก
ชี้กันคนละทิศ — อ่านอันนั้นก่อนถึง step 1 จะไม่งง

---

## What the box needs

ขนาดสำหรับงานจริง: คนในบริษัท ~20 คน ใช้พร้อมกันจริง ๆ ประมาณ 5

|      | ต่ำสุด    | สบาย      |
| ---- | --------- | --------- |
| vCPU | 2         | 2         |
| RAM  | 2 GB      | 4 GB      |
| Disk | 25 GB SSD | 40 GB SSD |

**ตัวเลขมาจากไหน** — image รวมกัน 900 MB (postgres 298, api 275, web 201,
garage 66, caddy 60) · memory ตอน idle **วัดจริงได้สองตัว** คือ Postgres 36 MB
กับ Garage 5 MB ส่วน Node อีกสองตัว (NestJS + Next standalone) **ไม่ได้วัด**
และเป็นตัวที่กินเยอะที่สุดพอดี — ประมาณตัวละร้อยกว่า MB · รวมทั้ง stack ~500 MB
บวก Ubuntu อีก ~400 MB

2 GB รันได้ แต่เหลือที่ว่างไม่มาก · เอา 4 GB ถ้าส่วนต่างไม่แพง — ที่เผื่อไม่ใช่
เผื่อ traffic ปกติ แต่เผื่อตอน `pg_dump` รันพร้อมกับมีคน upload ไฟล์

**CPU ไม่ใช่คอขวด** แต่ 1 vCPU แคบจริง เพราะตอน deploy มี migration, docker pull
และ server สองตัวแย่งกันอยู่

**Disk โตสามที่** — Postgres, object data ของ Garage, และ backup ถ้าเก็บไว้บนเครื่อง ·
**เก็บ backup ไว้นอกเครื่อง** ดู [backup.sh](backup.sh)

**เพิ่ม swap** ถ้าเอา 2 GB · ไม่ได้มีไว้ให้รันด้วย swap แต่มีไว้ให้จังหวะผิดปกติ
ช้าลงแทนที่จะโดน OOM killer

## Which Ubuntu

**24.04 LTS** · support ถึงปี 2029 · ผ่านการใช้งานจริงมาสองปี · และ apt repo
ของ Docker เองรองรับมานานแล้ว

26.04 LTS ออกแล้ว (เม.ย. 2026) ใช้ได้ไม่มีปัญหา แต่ไม่มีอะไรใน stack นี้ที่ต้องใช้
ของใหม่ — เครื่องที่ควรน่าเบื่อก็เลือกของน่าเบื่อ

**อย่าใช้ non-LTS บน server** · support แค่ 9 เดือน

---

## 1. First login แล้วเลิก login แบบนี้

provider ให้ root password หรือ key มา · ใช้มันครั้งเดียว

ถ้ายังไม่มี key ของตัวเอง สร้างก่อนตาม [SSH-KEYS.md §1](SSH-KEYS.md#1-your-own-key)

```bash
ssh root@<server-ip>

adduser deploy                     # ตั้ง password จริง ๆ ต้องใช้ตอน sudo
usermod -aG sudo deploy

# ให้มันใช้ key ไม่ใช่ password
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/   # ถ้า provider ใส่ไว้ให้แล้ว
#   ถ้าไม่มี: nano /home/deploy/.ssh/authorized_keys แล้ว paste บรรทัด .pub
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

เปิด terminal **อีกหน้าต่าง** แล้วยืนยันว่า `ssh deploy@<server-ip>` เข้าได้
ก่อนแตะ sshd · ล็อกตัวเองออกตรงนี้แปลว่าต้องไปเริ่มที่ rescue console

```bash
sudo nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
sudo systemctl restart ssh

sudo sshd -T | grep -iE 'passwordauth|permitrootlogin'   # เช็คค่าที่มีผลจริง
```

> ⚠️ Ubuntu อ่าน `/etc/ssh/sshd_config.d/*.conf` **ทีหลัง** ไฟล์หลัก และ cloud
> image ชอบหย่อน `PasswordAuthentication yes` ไว้ในนั้น · แก้ไฟล์หลักอย่างเดียว
> แล้วไม่มีผล · `sshd -T` คือตัวที่บอกความจริง

## 2. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp        # HTTP/3 · ไม่เอาก็ได้
sudo ufw enable
```

แค่นี้ · Postgres กับ Garage เข้าถึงได้เฉพาะใน Docker network เท่านั้น —
`compose.yml` ไม่ publish port ให้มันเลย ซึ่งตั้งใจ

> ⚠️ **cloud firewall / security group อยู่หน้า ufw และเป็นคนละลิสต์** · เปิด 80
> ที่ ufw แล้วลืมอีกที่ จะได้ Caddy ที่ขอ certificate ไม่ได้ พร้อม error ที่พูดเรื่อง
> ACME ไม่ได้พูดเรื่อง firewall

> ⚠️ **Docker publish port ด้วยการเขียน iptables ที่ข้าม ufw** · stack นี้ไม่กระทบ
> เพราะมีแค่ Caddy ที่ publish และ Caddy ควรเปิดสาธารณะอยู่แล้ว — แต่อย่าเผลอคิดว่า
> ufw กำลังกัน container port ที่ publish เพิ่มทีหลัง

## 3. Docker

จาก repo ของ Docker เอง ไม่ใช่ package `docker.io` ของ Ubuntu ซึ่งเวอร์ชันช้ากว่า
และไม่มี Compose v2 plugin ที่ stack นี้ต้องใช้

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
```

logout แล้ว login ใหม่ให้ group มีผล แล้วเช็คทั้งสองอย่าง:

```bash
docker run --rm hello-world
docker compose version          # ต้องเป็น v2.x · "docker-compose" มีขีดคือ v1
```

> ⚠️ อยู่ใน group `docker` **เทียบเท่า root** เพราะ mount filesystem ของ host
> เข้า container ได้ · สำหรับ deploy user ยอมรับได้ แต่ไม่ใช่สิ่งที่แจกกันเล่น ๆ

ปิดไม่ให้ log ของ Docker กินดิสก์จนเต็ม · ถ้าไม่ตั้ง container ที่ log เรื่อย ๆ
จะทำให้เครื่องเต็มในไม่กี่เดือน แล้วอาการที่เห็นจะเหมือนปัญหา database

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
sudo systemctl restart docker
```

**ปล่อยเครื่องไว้ที่ UTC** · application ขอ `Asia/Bangkok` เองตรงที่ต้องใช้ และ
server ที่ตั้งเวลาท้องถิ่นทำให้ไล่ log ข้ามระบบยากกว่าที่ควร

```bash
timedatectl                          # ควรเป็น UTC และ NTP active
```

## 4. DNS ก่อนอย่างอื่น

ชี้ `A` record มาที่ IP ของเครื่อง แล้วรอให้มัน resolve · Caddy จะให้
Let's Encrypt มาเรียก `http://<domain>/.well-known/…` ที่ port 80 ชื่อโดเมนเลย
ต้องใช้งานได้ก่อน

```bash
dig +short taskflow.example.com      # ต้องขึ้น IP ของเครื่อง
```

> ⚠️ **rate limit ของ Let's Encrypt มีจริง** — validation ที่ fail ประมาณ 5 ครั้ง
> ต่อชั่วโมง และ 50 certificate ต่อสัปดาห์ต่อโดเมน · debug TLS ด้วยการ `down`/`up`
> รัว ๆ จะโดนล็อกยาวเป็นชั่วโมง · ถ้ารู้ตัวว่าจะต้องลองหลายรอบ ให้ชี้ไป staging CA
> ก่อน โดยใส่ `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`
> ใน site block ของ [config/Caddyfile](config/Caddyfile) แล้วค่อยเอาออกเมื่อผ่าน ·
> certificate จาก staging browser ไม่เชื่อถือ ซึ่งคือประเด็น — มันพิสูจน์ว่า flow
> ถูกโดยไม่กิน quota

## 5. Deploy key ให้ server อ่าน repo ได้

ทำตาม [SSH-KEYS.md §2](SSH-KEYS.md#2-deploy-key--server-reads-github) —
สร้างบน server, เอา public ไปใส่ GitHub Deploy keys แบบ read-only

## 6. Clone · ตั้งค่า · login registry

```bash
sudo mkdir -p /srv/taskflow && sudo chown deploy:deploy /srv/taskflow
git clone -b prod git@github.com:PunchDrnt/taskflow.git /srv/taskflow
cd /srv/taskflow/deploy
cp .env.example .env
```

กรอก `.env` · **generate ทุก secret อย่าคิดเอง** — ในไฟล์มีคำสั่งกำกับไว้ทุกตัว
แล้วปิดสิทธิ์:

```bash
chmod 600 .env
```

login GHCR ด้วย personal access token ที่มีสิทธิ์ **`read:packages`** อย่างเดียว
(Settings → Developer settings → Tokens):

```bash
echo "<token>" | docker login ghcr.io -u <github-username> --password-stdin
```

> ⚠️ **GHCR package เป็น private โดย default** และ pull โดยไม่มีสิทธิ์จะ fail เป็น
> `manifest unknown` / **not found** ไม่ใช่ permission error · ถ้าเจอว่า image
> ไม่มีอยู่ ให้เช็คอันนี้ก่อนเช็ค tag

> ⚠️ **deploy ครั้งแรกไม่มี image ให้ pull** เพราะยังไม่เคย push · เลือกเอาว่าจะ
> push `prod` ให้ CI build ก่อน หรือ build บนเครื่องครั้งเดียวด้วย
> `docker compose up -d --build` ซึ่งทำได้เพราะ repo อยู่บนเครื่องแล้ว

## 7. Start

```bash
cd /srv/taskflow/deploy
docker compose up -d
docker compose ps
```

ควรได้ 7 service: `postgres` `garage` `web` `api` `caddy` ขึ้นอยู่ ·
`garage-init` กับ `api-migrate` exited 0 — สองตัวนี้ตั้งใจให้จบแล้วออก

แล้วเช็คจาก **นอกเครื่อง** เพราะ server ที่ตอบบน localhost แต่ไม่ตอบจากเน็ต
คือปัญหา firewall ที่ปลอมตัวมา:

```bash
curl -I https://taskflow.example.com
curl https://taskflow.example.com/api/health/ready
```

`/health/ready` ที่ขึ้น `database` และ `storage` เป็น up คือหลักฐานจริง

## 8. CI key ให้ Actions เข้า server ได้

ทำตาม [SSH-KEYS.md §3](SSH-KEYS.md#3-ci-key--actions-reaches-the-server) —
สร้างที่เครื่องตัวเอง, public ขึ้น server, private เอาไปใส่ secret ใน step ถัดไป

## 9. GitHub settings

**Settings → Secrets and variables → Actions → Secrets**

| Secret            | ค่า                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `SSH_HOST`        | IP หรือ hostname ของเครื่อง                                                              |
| `SSH_USER`        | `deploy`                                                                                 |
| `SSH_PRIVATE_KEY` | ทั้งไฟล์ `~/.ssh/taskflow_ci` จาก step 8 — ไม่ใช่ `.pub` และไม่ใช่ deploy key จาก step 5 |
| `DEPLOY_PATH`     | `/srv/taskflow` — คือ **clone ของ repo** ไม่ใช่ `deploy/` ข้างใน                         |

**→ Variables**

| Variable                 | ค่า                             |
| ------------------------ | ------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN ฝั่ง browser · ไม่ตั้งก็ได้ |

เป็น variable ไม่ใช่ secret เพราะยังไงมันก็ถูกส่งไปที่ browser ทุกคนอยู่แล้ว —
public DSN ออกแบบมาให้เห็นได้ การทำเป็นความลับมีแต่ทำให้ debug ยากขึ้น

**Branch** · `prod` คือตัวที่ deploy · แตกจาก `main` แล้ว protect ไว้ถ้าอยากมี
review gate:

```bash
git checkout -b prod main && git push -u origin prod
```

ที่เหลือไม่ต้องแก้: workflow ขอ `packages: write` ไว้แล้ว และ `GITHUB_TOKEN`
พอสำหรับ push ขึ้น GHCR

## 10. Deploy

```bash
git checkout prod && git merge main && git push
```

ดูใน Actions tab · มันจะ checkout `deploy/` ที่ commit นั้น, build แล้ว push
เฉพาะ image ที่เปลี่ยน, จากนั้น pull แล้ว restart

---

## Things that will surprise you

**`init/` รันครั้งเดียวตลอดกาล** · `init/postgres.sh` กับ `init/garage.sh` เห็นแค่
volume ว่าง · แก้ทีหลังไม่มีผลจนกว่าจะลบ volume ทิ้ง และลบ volume คือลบข้อมูล

**ไฟล์ที่ track อยู่ ถ้าแก้บนเครื่องจะถูกทับ** · deploy รัน `git checkout --force` ·
`deploy/.env` ไม่ได้ track เลยรอด แต่ `config/Caddyfile` ที่แก้ด้วยมือไม่รอด —
แก้ที่ repo

**ลบ `caddy-data` แล้วต้องขอ certificate ใหม่ทั้งหมด** ซึ่ง Let's Encrypt limit อยู่ ·
มันเก็บ ACME account key ไว้ · **อย่า `docker compose down -v` เล่น ๆ** — `-v`
ลบ volume ซึ่งรวม database ด้วย

**Postgres 18 เก็บ data ใน subdirectory ที่มีเลขเวอร์ชัน** · mount ที่
`/var/lib/postgresql` ไม่ใช่ `/var/lib/postgresql/data` แบบ 17 ลงไป ·
`compose.yml` ถูกอยู่แล้ว แต่คำสั่ง restore ที่พิมพ์เองอาจไม่

**backup ยังไม่ใช่ backup จนกว่าจะ restore สำเร็จ** · `backup.sh` เช็คด้วย
`pg_restore --list` ซึ่งพิสูจน์แค่ว่าไฟล์อ่านได้ ไม่ได้พิสูจน์ว่าข้อมูลถูก ·
ลอง restore เข้า database เปล่าเป็นระยะแล้วเปิดดูจริง

**ต้อง backup ทั้งสองที่ แยกกัน** · DB dump กู้ไฟล์แนบไม่ได้ และ object copy
กู้ task ไม่ได้

---

## Commands worth keeping

รันจาก `/srv/taskflow/deploy` ทั้งหมด

```bash
# อะไรรันอยู่ อะไร exit ไปแล้ว
docker compose ps -a

# log · -f คือตามต่อ · --tail จำกัดจำนวนบรรทัด
docker compose logs -f api
docker compose logs --tail 100 caddy

# restart ตัวเดียวโดยไม่ยุ่งตัวอื่น
docker compose restart api

# เอา config ที่เปลี่ยน (Caddyfile, compose.yml) ไปใช้
git pull && docker compose up -d

# ย้อนกลับไป release ก่อนหน้า
IMAGE_TAG=<commit-sha> docker compose pull
IMAGE_TAG=<commit-sha> docker compose up -d

# migration ไหนถูก apply ไปแล้วบ้าง
docker compose run --rm api-migrate \
  node ../../../node_modules/typeorm/cli.js migration:show \
  -d dist/database/data-source.js

# เข้า psql ด้วย role ที่แอปใช้ (ไม่ใช่ superuser)
# ใช้ sh -c ให้ตัวแปร expand ข้างใน container ที่ compose ใส่ไว้ให้ —
# บน host มันไม่มีค่าถ้ายังไม่ได้ source .env
docker compose exec postgres sh -c 'psql -U "$APP_DB_USER" -d "$POSTGRES_DB"'

# backup ทั้งสองที่ ไปไว้นอกเครื่อง
./backup.sh /srv/backups

# อะไรกินดิสก์
docker system df
df -h

# คืนพื้นที่จาก image เก่า · ปลอดภัย ตัวที่ใช้อยู่ไม่โดนลบ
docker image prune -f

# object storage จากใน network
docker compose exec garage /garage status
docker compose exec garage /garage bucket list
```

สองอันที่ควรคิดสักวินาทีก่อนกด enter:

```bash
docker compose down          # หยุดทุกอย่าง · volume ยังอยู่
docker compose down -v       # ...แล้วลบ database ด้วย · แทบไม่มีเหตุให้ใช้
```
