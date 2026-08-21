# SSH keys

การ deploy ชุดนี้ใช้ key **สามตัว** ไม่ใช่ตัวเดียว และสองตัวในนั้นใช้คนละทิศทางกัน
— เป็นจุดที่สลับกันบ่อยที่สุดเวลา auth ไม่ผ่าน

| key            | ใครใช้เข้าใคร               | private เก็บที่ | public ไปที่                |
| -------------- | --------------------------- | --------------- | --------------------------- |
| **ของคุณเอง**  | คุณ → server                | laptop ของคุณ   | `authorized_keys` บน server |
| **Deploy key** | **server → GitHub**         | server          | GitHub → Deploy keys        |
| **CI key**     | **GitHub Actions → server** | GitHub secret   | `authorized_keys` บน server |

หลักที่ใช้ตลอดทั้งเอกสารนี้: **private key ไม่ต้องย้ายไปไหน** ไฟล์ที่ copy ข้ามเครื่อง
คือ `.pub` เสมอ ถ้ากำลังจะ scp private key แสดงว่าทำผิดวิธีแล้ว

---

## Checking what you already have

ก่อนสร้างใหม่ ดูก่อนว่ามีอะไรอยู่

```bash
# มีไฟล์อะไรบ้าง และ permission เป็นยังไง
ls -la ~/.ssh/

# fingerprint · ชนิด · ความยาว ของทุก public key
for f in ~/.ssh/*.pub; do ssh-keygen -lf "$f"; done

# key ที่ไม่มี .pub คู่ (ไฟล์ .pem ที่ provider ให้มามักเป็นแบบนี้)
# ดึง public ออกมาได้ — public ไม่ใช่ความลับ
ssh-keygen -yf ~/.ssh/some-key.pem
ssh-keygen -lf ~/.ssh/some-key.pem

# agent ถือ key อะไรอยู่ · "no identities" ไม่ได้แปลว่าผิด
# ถ้า ~/.ssh/config ระบุ IdentityFile ไว้ตรง ๆ อยู่แล้ว
ssh-add -l

# ssh จะใช้ key ตัวไหนกับ host นี้ หลังอ่าน config แล้ว — ไม่ต้องต่อจริง
ssh -G <host> | grep -iE '^(hostname|user|identityfile)'

# ดูตอนต่อจริงว่าส่ง key ตัวไหนไปบ้าง แล้วตัวไหนผ่าน
ssh -v <host> 2>&1 | grep -iE 'offering|accepted|authenticated'

# private key ตัวไหนตั้ง permission กว้างเกินไป (ปกติต้องไม่มี output)
find ~/.ssh -maxdepth 1 -type f ! -name '*.pub' ! -name 'known_hosts*' \
     ! -name 'config' -perm +077
```

`ssh -G` ตอบคำถาม "ทำไมมันไม่ใช้ key ที่สั่ง" ได้เร็วที่สุด เพราะบอกว่า config
พาไปที่ไหนโดยไม่ต้องเปิด connection จริง

**ED25519 กับ RSA 2048 เจอทั้งคู่ในชีวิตจริง** RSA 2048 ยังใช้ได้ ไม่ต้องรีบเปลี่ยน ·
key ที่สร้างใหม่ในเอกสารนี้เป็น ed25519 ทั้งหมด เพราะสั้นกว่า เร็วกว่า และเป็น
default ของ `ssh-keygen` แล้ว

---

## 1. Your own key

ถ้ายังไม่มี สร้างที่ **เครื่องตัวเอง** ไม่ใช่บน server

```bash
ssh-keygen -t ed25519 -C "punch@laptop"    # กด enter รับ path เดิม · ตั้ง passphrase ด้วย
cat ~/.ssh/id_ed25519.pub                   # ซีกนี้ paste ที่ไหนก็ได้ ไม่เป็นไร
```

ตัวนี้ **ควรตั้ง passphrase** เพราะมีคนพิมพ์ให้ได้ ต่างจาก CI key ข้างล่าง

เอา public ขึ้น server:

```bash
ssh-copy-id deploy@<server-ip>
```

หรือทำเอง — ใช้ `>>` **ไม่ใช่ `>`** เพราะ `>` จะทับของเดิมทั้งไฟล์:

```bash
cat ~/.ssh/id_ed25519.pub | ssh deploy@<server-ip> 'cat >> ~/.ssh/authorized_keys'
```

> ⚠️ `authorized_keys` เก็บ **public** เท่านั้น หนึ่ง key = **หนึ่งบรรทัด** ·
> ถ้า editor ตัดบรรทัดให้ มันจะใช้ไม่ได้แบบไม่มี error แล้วอาการที่เห็นคือ
> ระบบขอ password ซึ่งดูเหมือน key ผิด

> ⚠️ permission เป็นข้อบังคับ ไม่ใช่คำแนะนำ · sshd **ไม่อ่านไฟล์เลย**
> ถ้า `authorized_keys` หรือ directory ของมัน group/world เขียนได้ โดยไม่บอกเหตุผล
> — `chmod 700 ~/.ssh` และ `chmod 600 ~/.ssh/authorized_keys`

---

## 2. Deploy key — server reads GitHub

ให้ server อ่าน repo ได้

workflow สั่ง `git fetch` บน server ตอน deploy มันเลยต้องอ่าน repo ได้ ·
สิทธิ์ที่ต้องการคือ **อ่านอย่างเดียว และเฉพาะ repo นี้** ซึ่งตรงกับ deploy key พอดี

สร้าง **บน server**:

```bash
ssh-keygen -t ed25519 -C "bangmod-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

เอา public ไปใส่ที่ GitHub → **Settings → Deploy keys → Add deploy key** ·
**ไม่ต้องติ๊ก** _Allow write access_

ทดสอบ:

```bash
ssh -T git@github.com     # ต้องขึ้นว่า "successfully authenticated"
```

> มันจะบอกด้วยว่า `does not provide shell access` — อันนั้นปกติ ไม่ใช่ error

---

## 3. CI key — Actions reaches the server

ให้ GitHub Actions ssh เข้าเครื่องได้

**ต้องแยกกับ key ส่วนตัวเสมอ** ไม่ใช่เรื่องความเป็นระเบียบ แต่เพราะ:

- ตัวนี้ **ตั้ง passphrase ไม่ได้** — ไม่มีอะไรพิมพ์ให้ตอน workflow รัน
- มันถูกเก็บใน GitHub secret แบบไม่เข้ารหัส
- ถ้าใช้ตัวเดียวกับที่คุณ ssh เข้าเครื่อง วันที่อยากยกเลิกมันจะยกเลิกไม่ได้
  เพราะตัวเองจะเข้าไม่ได้ไปด้วย

สร้างที่ **เครื่องตัวเอง**:

```bash
ssh-keygen -t ed25519 -C "github-actions@taskflow" -f ~/.ssh/taskflow_ci -N ""
```

`-N ""` คือ passphrase ว่าง · `-f` แยกไฟล์ออกมาไม่ให้ทับ `id_ed25519`

ได้สองไฟล์:

```
~/.ssh/taskflow_ci        private → GitHub secret · 600 · ไม่ออกจากเครื่อง
~/.ssh/taskflow_ci.pub    public  → authorized_keys บน server
```

เอา public ขึ้น server:

```bash
ssh-copy-id -i ~/.ssh/taskflow_ci.pub deploy@<server-ip>
```

**ทดสอบก่อนเอาไปให้ CI** เพราะ workflow ที่ auth ไม่ผ่านบอกอะไรน้อยกว่า ssh มาก:

```bash
ssh -i ~/.ssh/taskflow_ci deploy@<server-ip> 'docker compose version'
```

แล้ว copy **private** ทั้งไฟล์ — เอาบรรทัด `-----BEGIN-----` และ `-----END-----`
มาด้วย รวมถึง newline ท้ายไฟล์:

```bash
pbcopy < ~/.ssh/taskflow_ci             # macOS
xclip -sel clip < ~/.ssh/taskflow_ci    # Linux
```

อันนี้คือค่าของ secret `SSH_PRIVATE_KEY`

> ⚠️ เป็นไฟล์ที่ **ไม่มี** `.pub` · paste ซีก public ไปจะได้ error ที่หน้าตา
> เหมือน key ผิด เพราะมันผิดจริง

เวลาจะยกเลิกทีหลัง: ลบบรรทัดของมันออกจาก `~/.ssh/authorized_keys` บน server
เท่านั้น ไม่กระทบ key ตัวอื่น

---

## Troubleshooting

**auth ไม่ผ่าน แล้วไม่รู้ว่า key ตัวไหนผิด** — ไม่ต้องเดา คำสั่งนี้พิมพ์ public key ที่คู่กับ
private ตัวนั้นออกมา เอาไปเทียบกับบรรทัดใน `authorized_keys` บน server ได้เลย

```bash
ssh-keygen -yf ~/.ssh/taskflow_ci
```

ถ้าไม่ตรง แปลว่า secret กับ server ถือ key คนละตัวกัน

**ดูฝั่ง server ว่ามันปฏิเสธเพราะอะไร** — log บอกละเอียดกว่าฝั่ง client เยอะ

```bash
sudo journalctl -u ssh -n 50 --no-pager
```

**แก้ `sshd_config` แล้วไม่มีผล** — Ubuntu อ่าน `/etc/ssh/sshd_config.d/*.conf`
**ทีหลัง** ไฟล์หลัก และ cloud image ชอบหย่อน `PasswordAuthentication yes` ไว้ในนั้น
คำสั่งนี้บอกค่าที่มีผลจริง:

```bash
sudo sshd -T | grep -iE 'passwordauth|permitrootlogin|pubkeyauth'
```

**เปลี่ยนอะไรใน sshd แล้วอย่าเพิ่งปิด terminal เดิม** — เปิดอีกหน้าต่างแล้วทดสอบ
ว่ายัง login ได้ก่อน · ถ้าล็อกตัวเองออกจะต้องไปแก้ผ่าน rescue console ของ provider
