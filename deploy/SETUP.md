# Setting up the server

From a freshly created Ubuntu box to a deploy that runs on `git push`. Roughly
40 minutes, most of it waiting.

Nothing here is Taskflow-specific until step 6 — the earlier steps are how any
Docker host should be set up, and are worth reading rather than pasting.

---

## What the box needs

Sized for this deployment: about 20 people with a handful — say five — using it
at the same time.

|      | Minimum   | Comfortable |
| ---- | --------- | ----------- |
| vCPU | 2         | 2           |
| RAM  | 2 GB      | 4 GB        |
| Disk | 25 GB SSD | 40 GB SSD   |

**Where those come from.** Images are 900 MB on disk: postgres 298, api 275,
web 201, garage 66, caddy 60. Idle memory was measured for two of the five —
Postgres 36 MB, Garage 5 MB — and the two Node processes are the ones that
matter and were not measured; a NestJS and a Next standalone server idle in the
low hundreds of megabytes each. Call it ~500 MB for the stack, plus ~400 MB for
Ubuntu itself.

2 GB therefore works and leaves little room. Take 4 GB if the choice is cheap:
the headroom is not for steady traffic, it is for `pg_dump` running while
someone uploads a file.

**CPU is not the constraint** and one vCPU is genuinely tight, because a
migration, a Docker pull and the two servers all want it during a deploy.

**Disk grows in three places** — Postgres, Garage's object data, and backups if
they are kept locally. Keep backups off the box; see [backup.sh](backup.sh).

**Add swap** on a 2 GB box. It is not for running, it is so an unusual moment
degrades instead of triggering the OOM killer.

## Which Ubuntu

**24.04 LTS.** Supported to 2029, two years of production behind it, and
Docker's own apt repository has supported it that long.

26.04 LTS is out and will be fine, but it was released in April 2026 and
nothing here needs anything it added. Pick the boring one for a box that should
be dull.

Do not use a non-LTS release on a server. They are supported for nine months.

---

## 1. First login, and stop logging in like this

The provider gives a root password or an SSH key. Use it once.

```bash
ssh root@<server-ip>

adduser deploy                     # a real password; you need it for sudo
usermod -aG sudo deploy

# Give it your key rather than a password.
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/    # or paste your public key
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **second terminal** and confirm `ssh deploy@<server-ip>` works before
touching sshd. Locking yourself out here means starting from a rescue console.

```bash
sudo nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
sudo systemctl restart ssh
```

> ⚠️ On Ubuntu 24.04 sshd may read `/etc/ssh/sshd_config.d/*.conf` **after** the
> main file, and a cloud image often drops `PasswordAuthentication yes` in
> there. Editing only the main file then changes nothing. Check with
> `sudo sshd -T | grep -i passwordauth` — that prints what is actually in
> effect.

## 2. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp        # HTTP/3; skip if you would rather not
sudo ufw enable
```

Nothing else. Postgres and Garage are reachable only inside the Docker network
— `compose.yml` publishes no port for them, and that is deliberate.

> ⚠️ A cloud firewall or security group sits **in front of** ufw and is a
> separate list. Opening 80 here and forgetting it there gives a Caddy that
> cannot get a certificate and an error that talks about ACME, not firewalls.

> ⚠️ Docker publishes ports by writing iptables rules that **bypass ufw**. It
> does not affect this stack, because only Caddy publishes anything and Caddy
> should be public — but do not assume ufw is protecting a container port you
> publish later.

## 3. Docker

From Docker's repository, not Ubuntu's `docker.io` package, which lags and
does not ship the Compose v2 plugin this stack needs.

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

Log out and back in for the group to apply, then check both:

```bash
docker run --rm hello-world
docker compose version          # must be v2.x — "docker-compose" with a hyphen is v1
```

> ⚠️ `docker` group membership is **root equivalent** — anyone in it can mount
> the host filesystem into a container. That is an accepted trade for a deploy
> user; it is not something to hand out.

Make Docker's logs stop eating the disk. Without this, a container that logs
steadily fills the box over months and the failure looks like a database
problem:

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
sudo systemctl restart docker
```

Keep the clock right, and leave the box on UTC. The application asks for
`Asia/Bangkok` where it matters, and a server on local time makes correlating
logs harder than it needs to be.

```bash
timedatectl                          # expect UTC, and NTP active
```

## 4. DNS, before anything else starts

Point an `A` record at the server and wait for it to resolve. Caddy asks
Let's Encrypt to visit `http://<domain>/.well-known/…` on port 80, so the name
has to work first.

```bash
dig +short taskflow.example.com      # must print the server's IP
```

> ⚠️ **Let's Encrypt rate limits are real**: roughly 5 failed validations per
> hour, and 50 certificates per week per registered domain. Debugging TLS by
> repeatedly running `down` and `up` will lock you out for an hour. If you
> expect to iterate, point Caddy at the staging CA first — add
> `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` inside the
> site block in [config/Caddyfile](config/Caddyfile), and remove it once a
> certificate is issued. Staging certificates are untrusted by browsers, which
> is the point: it proves the flow without spending the quota.

## 5. A read-only key so the server can fetch the repo

The deploy workflow runs `git fetch` on the box, so it needs read access —
read only, and to this repository only. That is what a deploy key is.

```bash
ssh-keygen -t ed25519 -C "bangmod-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add that public key at **Settings → Deploy keys → Add deploy key**. Leave
_Allow write access_ unchecked.

```bash
ssh -T git@github.com     # expect "successfully authenticated", not shell access
```

## 6. Clone, configure, log in to the registry

```bash
sudo mkdir -p /srv/taskflow && sudo chown deploy:deploy /srv/taskflow
git clone -b prod git@github.com:PunchDrnt/taskflow.git /srv/taskflow
cd /srv/taskflow/deploy
cp .env.example .env
```

Fill in `.env`. Generate every secret rather than inventing one — the file has
the command beside each. Then:

```bash
chmod 600 .env
```

Log in to GHCR with a personal access token that has **`read:packages`** and
nothing else (Settings → Developer settings → Tokens):

```bash
echo "<token>" | docker login ghcr.io -u <github-username> --password-stdin
```

> ⚠️ GHCR packages are **private by default**, and a pull without access fails
> as `manifest unknown` / **not found** rather than as a permission error. If a
> pull says the image does not exist, check this before you check the tag.

> ⚠️ The first deploy has nothing to pull, because no image has been pushed
> yet. Either push to `prod` first and let CI build, or build once on the box
> with `docker compose up -d --build` — that needs the repository present,
> which it is.

## 7. Start it

```bash
cd /srv/taskflow/deploy
docker compose up -d
docker compose ps
```

Expect seven services: `postgres`, `garage`, `web`, `api` and `caddy` up,
`garage-init` and `api-migrate` exited 0. The two that exit are meant to.

Then check it from **outside** the box, because a server that answers on
localhost and not from the internet is a firewall problem wearing a disguise:

```bash
curl -I https://taskflow.example.com
curl https://taskflow.example.com/api/health/ready
```

`/health/ready` naming `database` and `storage` as up is the real proof.

## 8. GitHub settings

**Settings → Secrets and variables → Actions → Secrets**

| Secret            | Value                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSH_HOST`        | the server's IP or hostname                                                                                                                |
| `SSH_USER`        | `deploy`                                                                                                                                   |
| `SSH_PRIVATE_KEY` | a private key whose **public** half is in `/home/deploy/.ssh/authorized_keys` — not the deploy key from step 5, which points the other way |
| `DEPLOY_PATH`     | `/srv/taskflow` — the **clone**, not `deploy/` inside it                                                                                   |

**→ Variables**

| Variable                 | Value                           |
| ------------------------ | ------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | the browser DSN, or leave unset |

A variable rather than a secret because it ships to every browser anyway — a
public DSN is designed to be visible, and pretending otherwise makes it harder
to debug.

**Branch.** `prod` is what deploys. Create it from `main` and protect it if you
want a review gate:

```bash
git checkout -b prod main && git push -u origin prod
```

Nothing else needs changing: the workflow already asks for `packages: write`,
and `GITHUB_TOKEN` is enough to push to GHCR.

> ⚠️ **Two different keys are in play** and swapping them is the usual mistake.
> Step 5's deploy key lets the _server_ read _GitHub_. `SSH_PRIVATE_KEY` lets
> _GitHub Actions_ log in to the _server_. They are separate keypairs pointing
> in opposite directions.

## 9. Deploy

```bash
git checkout prod && git merge main && git push
```

Watch it in the Actions tab. It checks `deploy/` out at that commit, builds and
pushes the images that changed, then pulls and restarts.

---

## Things that will surprise you

**`init/` runs once, ever.** `init/postgres.sh` and `init/garage.sh` only see
an empty volume. Editing them after the first boot changes nothing until that
volume is deleted, and deleting the volume deletes the data.

**A tracked file edited on the box is discarded.** Deploy runs
`git checkout --force`. `deploy/.env` is untracked and survives; a hand-edited
`config/Caddyfile` does not. Change it in the repository.

**Losing `caddy-data` means re-issuing every certificate**, and Let's Encrypt
rate-limits that. It holds the ACME account key. Never `docker compose down -v`
on a whim — `-v` deletes volumes, which is the database too.

**Postgres 18 stores data in a versioned subdirectory.** The mount is at
`/var/lib/postgresql`, not `/var/lib/postgresql/data` as in 17 and earlier.
`compose.yml` already has it right; a hand-written restore command might not.

**Backups are not backups until restored.** `backup.sh` verifies the dump with
`pg_restore --list`, which proves the file is readable, not that the data is
right. Restore into a scratch database occasionally and look.

**Both stores must be backed up**, separately. A database dump cannot restore
an uploaded file, and an object copy cannot restore a task.

---

## Commands worth keeping

All of these run from `/srv/taskflow/deploy`.

```bash
# What is running, and what exited
docker compose ps -a

# Logs. -f follows, --tail limits the scrollback
docker compose logs -f api
docker compose logs --tail 100 caddy

# Restart one service without touching the rest
docker compose restart api

# Apply a config change (Caddyfile, compose.yml) after pulling it
git pull && docker compose up -d

# Roll back to a previous release
IMAGE_TAG=<commit-sha> docker compose pull
IMAGE_TAG=<commit-sha> docker compose up -d

# Migrations: what has been applied
docker compose run --rm api-migrate \
  node ../../../node_modules/typeorm/cli.js migration:show \
  -d dist/database/data-source.js

# A psql shell, as the non-superuser role the app uses. sh -c so the
# variables expand inside the container, where compose put them — on the
# host they are unset unless you have sourced .env
docker compose exec postgres sh -c 'psql -U "$APP_DB_USER" -d "$POSTGRES_DB"'

# Back up both stores to somewhere off this box
./backup.sh /srv/backups

# What is using the disk
docker system df
df -h

# Reclaim space from old images. Safe: the running ones are kept
docker image prune -f

# Object storage, from inside the network
docker compose exec garage /garage status
docker compose exec garage /garage bucket list
```

Two that deserve a second's thought before you press enter:

```bash
docker compose down          # stops everything. Volumes survive
docker compose down -v       # ...and deletes the database. Almost never
```
