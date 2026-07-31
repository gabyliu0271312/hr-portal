#!/usr/bin/env sh
set -e

# 发布顺序（阻断问题二）：先迁移数据库，再部署/启动应用。
# 迁移失败则拒绝启动，避免应用跑在陈旧 schema 上导致整片功能不可用。
echo "[entrypoint] applying database migrations (must succeed before app starts)..."
if ! alembic upgrade head; then
  echo "[entrypoint] ERROR: alembic upgrade head 失败 —— 拒绝在陈旧 schema 上启动应用。" >&2
  echo "[entrypoint] 请先排查迁移（或确认数据库可达），再重新启动容器。" >&2
  exit 1
fi
echo "[entrypoint] migrations up to date."

echo "[entrypoint] preparing PostgreSQL HBA managed block..."
if ! python -c 'from app.push.pg_hba import prepare_pg_hba_managed_block; prepare_pg_hba_managed_block()'; then
  echo "[entrypoint] ERROR: pg_hba.conf 受管规则区块升级失败 —— 为保护自定义认证规则，拒绝启动。" >&2
  exit 1
fi

echo "[entrypoint] starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
