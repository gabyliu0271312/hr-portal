FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 安装编译依赖、LibreOffice 和中文字体，保证 DOCX 转 PDF 时中文可正确渲染
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        fontconfig \
        fonts-noto-cjk \
        fonts-wqy-zenhei \
        libpq-dev \
        libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

COPY docker/fonts/zh-font-aliases.conf /etc/fonts/conf.d/99-zh-font-aliases.conf
RUN fc-cache -f -v

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

COPY . .

RUN chmod +x ./entrypoint.sh

EXPOSE 8000

CMD ["./entrypoint.sh"]
