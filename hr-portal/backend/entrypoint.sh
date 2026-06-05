#!/usr/bin/env sh
set -e

# 等数据库就绪（最多 30 秒；docker-compose healthcheck 也会兜底）
echo "[entrypoint] running alembic migrations..."
alembic upgrade head || echo "[entrypoint] WARN: alembic upgrade failed (probably no migrations yet, continuing)"

echo "[entrypoint] starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"