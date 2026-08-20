# deploy/

Everything the server runs, and nothing else from this repository. Copy this
directory to the box, create `.env` beside `compose.yml`, and that is the whole
installation — the application itself arrives as images from GHCR.

```bash
cd deploy
cp .env.example .env        # then fill it in
docker compose up -d
```

No `-f` and no `--env-file`: `compose.yml` and a sibling `.env` are what
`docker compose` picks up on its own.

```
deploy/
├─ compose.yml      the stack — only caddy publishes a port
├─ .env.example     copy to .env here; .env is the one file never committed
├─ config/          mounted read-only, re-read on the next `up -d`
│  ├─ Caddyfile     one origin: /api/* to Nest with the prefix stripped
│  └─ garage.toml   object storage
├─ init/            run once against an empty volume, ignored ever after
│  ├─ postgres.sh   creates the non-superuser role the application uses
│  └─ garage.sh     assigns the cluster layout, key and bucket
└─ backup.sh        database and objects, to separate directories
```

`config/` and `init/` are split because they behave differently, and the
difference is easy to lose an afternoon to: editing `config/Caddyfile` takes
effect on the next `up -d`, while editing anything in `init/` does nothing at
all until the volume it initialises is gone.

`config/garage.toml` and `init/garage.sh` are mounted by the development stack
at the repository root as well, so the two cannot drift.

## Why these are committed

None of them contains a secret — every one is `${VARIABLE}`, filled from `.env`
at run time. Keeping them out of version control would hide only the shape of
the deployment, which protects nothing and costs the ability to see what
changed. `.env` itself is the real secret, and `.gitignore` covers it.

The directory is not `.deploy` for a plainer reason: `cp -R src/*` and
`tar czf - src/*` both skip a dot-directory silently, and this is the one
directory whose whole purpose is being copied to a server.

## Updating

`docker compose pull && docker compose up -d` brings new **images**, and that
is all `.github/workflows/deploy.yml` does today.

It does **not** update the files in this directory. Change `config/Caddyfile`
or `compose.yml`, deploy, and the workflow goes green while the server keeps
running the old ones — so for now those changes have to reach the box by hand.
Making this directory a checkout of `prod` and adding a `git checkout` before
the pull would close that, and is the reason it is one self-contained
directory.
