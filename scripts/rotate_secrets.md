# fluxsolutions Secret Rotation

1. Generate new secrets:
   - `openssl rand -hex 32` for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_SHARE_SECRET`.
   - `openssl rand -base64 32 | tr -d '\n'` for `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`.
2. Update `.env` on VPS with new values.
3. Rotate JWT secrets in this order:
   - Stop web/api: `docker compose stop fluxsolutions-web fluxsolutions-api`
   - Update env values
   - Start api/web: `docker compose up -d fluxsolutions-api fluxsolutions-web`
   - Old sessions will be logged out.
4. Rotate DB password:
   - Update password in Postgres first: `ALTER USER fluxsolutions WITH PASSWORD 'NEW_PASSWORD';`
   - Update `.env` (`POSTGRES_PASSWORD` and `DATABASE_URL`)
   - Restart API and Postgres clients.
5. Rotate MinIO credentials:
   - Update MinIO root credentials and API S3 credentials together.
   - Restart MinIO + API + nginx.
6. Verify health:
   - `docker compose ps`
   - `curl -fsS https://api.fluxsolutions.tld/healthz`
   - Upload/download smoke test.
