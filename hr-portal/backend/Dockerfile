FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 安装编译时依赖（asyncpg 需要）
# 换国内源（阿里云）：apt 兼容 Debian 12(sources.list)与 Debian 13(deb822) 两种格式；pip 用阿里云 pypi
RUN { [ -f /etc/apt/sources.list ] && sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list; true; } \
    && { [ -f /etc/apt/sources.list.d/debian.sources ] && sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list.d/debian.sources; true; } \
    && apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip install --upgrade pip && pip install -e ".[dev]"

# Install test dependencies (kept in image for regression testing)
RUN pip install pytest pytest-asyncio

COPY . .

EXPOSE 8000

CMD ["bash", "./entrypoint.sh"]