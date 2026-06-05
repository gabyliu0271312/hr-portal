# HR Portal Backend

FastAPI + SQLAlchemy 2.0 async + Postgres 15 + Alembic + APScheduler。

## 本地开发

```bash
# 1. 创建虚拟环境
python -m venv .venv
. .venv/bin/activate    # Linux/macOS
# .venv\Scripts\activate   # Windows PowerShell

# 2. 安装依赖
pip install -e ".[dev]"

# 3. 跑迁移
alembic upgrade head

# 4. 启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API 文档

启动后访问 http://localhost:8000/docs（Swagger UI，由 FastAPI 自动生成）。

## 测试

```bash
pytest
```