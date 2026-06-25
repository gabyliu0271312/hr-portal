FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 安装编译时依赖（asyncpg 需要）
# 换国内源（清华）：apt 兼容 Debian 12(sources.list)与 Debian 13(deb822) 两种格式；pip 用清华 pypi
RUN { [ -f /etc/apt/sources.list ] && sed -i 's@deb.debian.org@mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list; true; } \
    && { [ -f /etc/apt/sources.list.d/debian.sources ] && sed -i 's@deb.debian.org@mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list.d/debian.sources; true; } \
    && apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip install --upgrade pip && pip install -e .

COPY . .

RUN chmod +x ./entrypoint.sh

EXPOSE 8000

CMD ["./entrypoint.sh"]