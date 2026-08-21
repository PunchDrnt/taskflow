# SSH keys

การ deploy ชุดนี้ใช้ key สาม **ดอก** ไม่ใช่ดอกเดียว และสองดอกในนั้นชี้กันคนละทิศ
— ซึ่งเป็นจุดที่สลับกันบ่อยที่สุดเวลา auth ไม่ผ่าน

| ดอก            | ใครใช้เข้าใคร               | private เก็บที่ | public ไปที่                |
| -------------- | --------------------------- | --------------- | --------------------------- |
| **ของคุณเอง**  | คุณ → server                | laptop ของคุณ   | `authorized_keys` บน server |
| **Deploy key** | **server → GitHub**         | server          | GitHub → Deploy keys        |
| **CI key**     | **GitHub Actions → server** | GitHub secret   | `authorized_keys` บน server |

หลักที่ใช้ตลอดทั้งเอกสารนี้: **private ไม่เคยเดินทาง** ไฟล์ที่ copy ไปไหนมาไหนคือ
`.pub` เสมอ ถ้าเมื่อไหร่กำลังจะ scp private key ข้ามเครื่อง แปลว่าเดินผิดทางแล้ว

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

# ssh จะใช้ key ดอกไหนกับ host นี้ หลังอ่าน config แล้ว — ไม่ต้องต่อจริง
ssh -G <host> | grep -iE '^(hostname|user|identityfile)'

# ดูตอนต่อจริงว่ายื่นดอกไหนไปบ้าง แล้วดอกไหนผ่าน
ssh -v <host> 2>&1 | grep -iE 'offering|accepted|authenticated'

# private key ดอกไหนเปิดกว้างเกินไป (ควรไม่มี output)
find ~/.ssh -maxdepth 1 -type f ! -name '*.pub' ! -name 'known_hosts*' \
     ! -name 'config' -perm +077
```

`ssh -G` เป็นอันที่ตัดจบได้เร็วสุดเวลาสงสัยว่า "ทำไมมันไม่ใช้ดอกที่สั่ง" —
มันตอบว่า config พาไปที่ไหนโดยไม่ต้องเปิด connection

**ED25519 กับ RSA 2048 เจอทั้งคู่ในชีวิตจริง** RSA 2048 ยังใช้ได้ ไม่ต้องรีบเปลี่ยน ·
ดอกใหม่ทุกดอกในเอกสารนี้เป็น ed25519 เพราะสั้นกว่า เร็วกว่า และเป็น default
ของ `ssh-keygen` แล้ว

---

## 1. Your own key

ถ้ายังไม่มี สร้างที่ **เครื่องตัวเอง** ไม่ใช่บน server

```bash
ssh-keygen -t ed25519 -C "punch@laptop"    # กด enter รับ path เดิม · ตั้ง passphrase ด้วย
cat ~/.ssh/id_ed25519.pub                   # ซีกนี้ paste ที่ไหนก็ได้ ไม่เป็นไร
```

ดอกนี้ **ควรมี passphrase** เพราะมีคนพิมพ์ให้ได้ ต่างจาก CI key ข้างล่าง

เอา public ขึ้น server:

```bash
ssh-copy-id deploy@<server-ip>
```

หรือทำเอง — ใช้ `>>` **ไม่ใช่ `>`** เพราะ `>` จะทับของเดิมทั้งไฟล์:

```bash
cat ~/.ssh/id_ed25519.pub | ssh deploy@<server-ip> 'cat >> ~/.ssh/authorized_keys'
```

> ⚠️ `authorized_keys` เก็บ **public** เท่านั้น หนึ่ง key = **หนึ่งบรรทัด** ·
> editor ที่ตัดบรรทัดให้จะทำให้มันเงียบ ๆ ใช้ไม่ได้ แล้วอาการที่เห็นคือ
> "ขอ password" เหมือน key ผิด

> ⚠️ permission เป็นเรื่องบังคับ ไม่ใช่คำแนะนำ · sshd **เมินทั้งไฟล์**
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

**แยกดอกกับของตัวเองเสมอ** เหตุผลไม่ใช่ความเนี้ยบ แต่เพราะ:

- ดอกนี้ **ไม่มี passphrase ได้อย่างเดียว** — ไม่มีอะไรพิมพ์ให้ตอน workflow รัน
- มันนอนอยู่ใน GitHub secret แบบไม่เข้ารหัส
- ถ้าใช้ดอกเดียวกับที่คุณ ssh เข้าเครื่อง วันที่อยากเพิกถอนจะเพิกถอนไม่ได้
  เพราะตัวเองจะเข้าไม่ได้ด้วย

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

เวลาจะเพิกถอนทีหลัง: ลบบรรทัดของมันออกจาก `~/.ssh/authorized_keys` บน server
จบ ไม่กระทบดอกอื่น

---

## Troubleshooting

**auth ไม่ผ่าน แล้วไม่รู้ว่าดอกไหนผิด** — อย่าเดา คำสั่งนี้พิมพ์ public key ที่คู่กับ
private ดอกนั้นออกมา เอาไปเทียบกับบรรทัดใน `authorized_keys` บน server ได้เลย

```bash
ssh-keygen -yf ~/.ssh/taskflow_ci
```

ถ้าไม่ตรง แปลว่า secret กับ server ถือคนละดอก

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
ว่ายัง login ได้ก่อน · ล็อกตัวเองออกแปลว่าต้องไปงมที่ rescue console ของ provider
