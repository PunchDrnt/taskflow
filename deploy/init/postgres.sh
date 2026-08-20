#!/bin/sh
# Runs once, on an empty data directory, as the superuser the image created.
#
# Its whole job is that the application never connects as that superuser. A
# compromised app process should not be able to read pg_authid, COPY from the
# filesystem, or drop the roles that own the backups.
#
# The app role can still run every migration: it owns the database, and the
# only extension this schema needs is citext, which Postgres marks *trusted* —
# installable by a non-superuser holding CREATE. See migration 001.
set -eu

: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
  CREATE ROLE "$APP_DB_USER"
    LOGIN PASSWORD '$APP_DB_PASSWORD'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

  -- Owning the database is what lets migrations CREATE SCHEMA and install
  -- citext. It is not superuser: the role still cannot reach another database
  -- or read the server's files.
  ALTER DATABASE "$POSTGRES_DB" OWNER TO "$APP_DB_USER";
  GRANT CONNECT, CREATE ON DATABASE "$POSTGRES_DB" TO "$APP_DB_USER";

  -- Postgres 15 took CREATE on public away from PUBLIC. citext is pinned to
  -- public by migration 001, so the role needs it back — explicitly, for one
  -- role, rather than by handing it to everyone again.
  GRANT CREATE, USAGE ON SCHEMA public TO "$APP_DB_USER";
SQL

echo "created non-superuser role $APP_DB_USER"
