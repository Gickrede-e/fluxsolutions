# fluxsolutions

Production-ready file sharing platform (`fluxsolutions`) for VPS deployment with Docker Compose v2.

## Features

- Email/password auth with `argon2`.
- JWT access + refresh tokens in `httpOnly` cookies.
- CSRF protection via double-submit token.
- Refresh token rotation with revoke/replacement tracking.
- Upload up to `1GB` per file by default (`MAX_FILE_SIZE_BYTES` configurable).
- Resumable upload via S3 multipart to MinIO (direct browser -> object storage).
- File/folder management, search by filename, rename/move/delete.
- Share links: public / password-protected / TTL / one-time / max-downloads.
- RBAC (`USER` / `ADMIN`), ban/unban, admin stats + audit log.
- Structured logging, request-id, `/healthz`, `/readyz`, `/metrics`.
- Optional ClamAV scanning (`ENABLE_CLAMAV=true`) with `PENDING` -> `CLEAN/INFECTED` states.
- Production infra: `web`, `api`, `postgres`, `minio`, `nginx`, optional `clamav`.

## Monorepo Layout

```text
fluxsolutions/
  apps/
    api/              # Fastify + Prisma + S3 multipart + auth/security
    web/              # Next.js App Router + Tailwind + SWR
  packages/
    shared/           # Shared constants/schemas/types
  deploy/
    nginx/            # Reverse proxy and files vhost config
  scripts/
    backup_postgres.sh
    restore_postgres.sh
    rotate_secrets.md
  docker-compose.yml
  .env.example
```

## Architecture

- Frontend: Next.js App Router (`apps/web`)
- API: Fastify + TypeScript (`apps/api`)
- DB: PostgreSQL + Prisma migrations
- Object storage: MinIO (S3-compatible)
- Reverse proxy: Nginx
- Observability: Pino logs + Prometheus metrics endpoint

### Request/Data Flow

1. Browser asks API `/files/initiate-upload`.
2. API creates multipart upload in MinIO, returns presigned part URLs on `files.fluxsolutions.tld`.
3. Browser uploads parts directly to MinIO (API does not proxy large files).
4. Browser calls `/files/complete-upload`.
5. API finalizes multipart upload and stores metadata in PostgreSQL.

## CDN Strategy (Required)

Recommended domain scheme:

- `app.fluxsolutions.tld` -> CDN/Proxy -> Nginx -> Web
- `api.fluxsolutions.tld` -> CDN/Proxy -> Nginx -> API
- `files.fluxsolutions.tld` -> CDN/Proxy -> Nginx -> MinIO

### Strategy A (default in project)

- API signs S3 URLs using `S3_PUBLIC_ENDPOINT=https://files.fluxsolutions.tld`.
- Browser downloads/uploads directly through CDN/files domain.
- Works well with edge routing and direct object path.

### Cache-Control Guidance

In API `/s/:token/download`:

- Restricted share (password/TTL/one-time/max-downloads): `Cache-Control: private, no-store`
- Open share (no password, no limits, no TTL): `Cache-Control: public, max-age=31536000, immutable`

When to disable cache:

- Any private or revocable access mode.
- When legal/privacy policy requires immediate revoke behavior.

Deletion/invalidation:

- Object keys are unique per upload; signed URLs are short-lived.
- For restricted links, cache is disabled, so explicit CDN purge is typically not required.
- For public immutable links, purge if you expose long-lived cached URL and need immediate deletion.

### Strategy B (fallback if presigned cache behavior is insufficient)

If query-signed URLs are not cache-efficient for your CDN policy, use:

- API download redirect endpoint with short-lived token,
- Edge rule to validate token/signature,
- Internal proxy (`X-Accel-Redirect`-style pattern) or signed headers/cookies at edge.

This repo already exposes redirect entry point (`GET /s/:token/download`) that can be adapted for that flow.

## Security Baseline

Implemented:

- `argon2id` password hashing.
- JWT access + refresh cookies (`httpOnly`, secure flags).
- Refresh token rotation with DB persistence (`refresh_tokens`).
- CSRF token validation (`x-csrf-token` + cookie).
- Input validation (`zod`).
- MIME allowlist policy + content sniff check after upload completion.
- File size limit (`MAX_FILE_SIZE_BYTES`, default 1GB).
- Rate limiting (`@fastify/rate-limit`).
- Helmet security headers.
- CORS allowlist.
- Secrets only from environment.

Threat model (short):

- Account takeover attempts -> strong hashing + token rotation + ban controls.
- CSRF on cookie auth -> enforced CSRF token for state-changing endpoints.
- Upload abuse / DoS -> request limits, file-size cap, direct object upload path.
- Malicious file delivery -> MIME policy, optional ClamAV scanning, scan-status gating.
- Leaked links -> optional password/TTL/one-time/max-downloads.

## API Endpoints

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/csrf`

User:

- `GET /me`
- `POST /me/change-password`

Files/Folders:

- `POST /files/initiate-upload`
- `POST /files/resume-upload`
- `POST /files/complete-upload`
- `GET /files`
- `PATCH /files/:id`
- `DELETE /files/:id`
- `GET /files/:id/download`
- `GET /folders`
- `POST /folders`
- `DELETE /folders/:id`

Shares:

- `POST /shares`
- `GET /s/:token`
- `POST /s/:token/verify`
- `GET /s/:token/download`

Admin:

- `GET /admin/users`
- `POST /admin/users/:id/ban`
- `GET /admin/stats`

Observability:

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Environment Variables

Copy `.env.example` -> `.env` and set strong secrets.

Generate random secrets:

```bash
openssl rand -hex 32
openssl rand -base64 32 | tr -d '\n'
```

Critical vars:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_SHARE_SECRET`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `MAX_FILE_SIZE_BYTES` (default `1073741824`)
- `ALLOWED_MIME_TYPES`
- `S3_PUBLIC_ENDPOINT` (`https://files.fluxsolutions.tld`)

## Local Development

1. Install dependencies:

```bash
nvm use 22 || nvm install 22
npm install
```

2. Copy env file:

```bash
cp .env.example .env
```

3. Start infra only:

```bash
docker compose up -d fluxsolutions-postgres fluxsolutions-minio fluxsolutions-minio-init
```

4. Run migrations:

```bash
npm run prisma:migrate:deploy --workspace @fluxsolutions/api
```

5. Start apps:

```bash
npm run dev
```

6. Open:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## VPS Production Deploy (Docker Compose v2)

1. Prepare server:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```

2. Clone and configure:

```bash
git clone <your-repo-url> fluxsolutions
cd fluxsolutions
cp .env.example .env
# edit .env
```

3. Build and start:

```bash
docker compose build
docker compose up -d
```

4. Verify:

```bash
docker compose ps
curl -fsS http://127.0.0.1:4000/healthz
curl -fsS http://127.0.0.1:4000/readyz
```

5. Enable ClamAV profile (optional):

```bash
docker compose --profile security up -d fluxsolutions-clamav
```

## Domains + TLS + CDN (Cloudflare/CDNNow)

### DNS

Create records:

- `fluxsolutions.ru` -> `A` to VPS IPv4
- `www.fluxsolutions.ru` -> `CNAME` to `fluxsolutions.ru`
- `api.fluxsolutions.ru` -> `A` to VPS IPv4
- `cdn.fluxsolutions.ru` -> CDN provider hostname (for example `*.trbcdn.net`)

### TLS

Option 1 (CDN edge TLS, origin HTTP):

- CDN terminates TLS at edge and forwards to origin over `HTTP:80`.
- Useful when `cdn.fluxsolutions.ru` points to CDN network, not directly to VPS.

Option 2 (Let's Encrypt via certbot):

- Use mounted paths `deploy/certbot/www` and `deploy/certbot/conf`.
- Issue certs for app + api domains and enable HTTPS vhosts in Nginx.
- TLS vhost template: `deploy/nginx/examples/fluxsolutions-ssl.conf`.
- Copy to `deploy/nginx/conf.d/` after certs are issued, then reload nginx.

Bootstrap certs example:

```bash
docker compose run --rm fluxsolutions-certbot certonly \
  --webroot -w /var/www/certbot \
  -d fluxsolutions.ru -d www.fluxsolutions.ru -d api.fluxsolutions.ru \
  --email you@example.com --agree-tos --no-eff-email
cp deploy/nginx/examples/fluxsolutions-ssl.conf deploy/nginx/conf.d/fluxsolutions-ssl.conf
docker compose restart fluxsolutions-nginx
docker compose --profile tls up -d fluxsolutions-certbot
```

### Cloudflare Settings

- Proxy enabled for app + api domains.
- SSL/TLS: `Full (strict)`.
- Cache rules:
  - `app`/`api`: bypass dynamic routes.
  - `files`/`cdn`: allow cache only for responses with `public, max-age=...`.
- Keep query string for presigned URLs (required).
- Enable range requests and large file support.

## Backups & Restore

Create backup:

```bash
./scripts/backup_postgres.sh
```

Restore backup:

```bash
./scripts/restore_postgres.sh backups/fluxsolutions_postgres_YYYYMMDD_HHMMSS.sql.gz
```

Secret rotation runbook: `scripts/rotate_secrets.md`

## Updates, Zero-Downtime, Rollback

Rolling update (single VPS best effort):

```bash
git pull
docker compose build fluxsolutions-api fluxsolutions-web
docker compose up -d fluxsolutions-api fluxsolutions-web fluxsolutions-nginx
```

Notes:

- Nginx keeps serving while web/api containers restart.
- Active uploads may need retry/resume (multipart resumable flow handles this).

Rollback:

```bash
git checkout <previous-stable-tag-or-commit>
docker compose build fluxsolutions-api fluxsolutions-web
docker compose up -d fluxsolutions-api fluxsolutions-web fluxsolutions-nginx
```

If schema changed, rollback requires DB migration plan and/or restore from backup.

## Quality

- Strict TypeScript, ESLint, Prettier.
- Backend unit + e2e tests (`vitest`, `supertest`).

Run checks:

```bash
npm run lint
npm run test
npm run build
```

## Troubleshooting

- `container fluxsolutions-minio is unhealthy`:
  - Check logs: `docker compose logs fluxsolutions-minio`.
  - Ensure `.env` exists and has `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.
  - Recreate MinIO stack:
    - `docker compose rm -sf fluxsolutions-minio fluxsolutions-minio-init`
    - `docker compose up -d fluxsolutions-minio fluxsolutions-minio-init`
- `Prisma ... Environment variable not found: DATABASE_URL`:
  - Ensure `.env` exists in repo root (`cp .env.example .env`).
  - Verify value: `grep '^DATABASE_URL=' .env`.
  - Re-run: `npm run prisma:migrate:deploy --workspace @fluxsolutions/api`.
- API dev crash on Node 18:
  - Use Node 22 (`nvm use 22`) because project targets Node 22 (see `.nvmrc`).
- Next.js `module is not defined` from PostCSS:
  - Fixed by ESM postcss config; if cached old state, restart dev server.

## Primary Files

- API app: `apps/api/src/app.ts`
- API routes: `apps/api/src/routes`
- Prisma schema: `apps/api/prisma/schema.prisma`
- Web app router: `apps/web/app`
- Compose: `docker-compose.yml`
- Nginx: `deploy/nginx/conf.d/fluxsolutions-app.conf`, `deploy/nginx/conf.d/fluxsolutions-files.conf`
- Backup scripts: `scripts/backup_postgres.sh`, `scripts/restore_postgres.sh`
