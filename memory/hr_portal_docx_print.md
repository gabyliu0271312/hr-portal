# 文档打印与预览方案(Gotenberg + 统一预览)

> 2026-06-17 完成并上线 main。取代 [hr_portal_docx_print_followup_2026-06-16.md](./hr_portal_docx_print_followup_2026-06-16.md)(那是暂停期的交接记录)。

## 架构:Gotenberg 独立服务转 PDF

**backend 不内置 LibreOffice**,docx→PDF 交给独立的 `gotenberg/gotenberg:8` 服务。

- `backend/app/tools/docx_convert.py` 的 `convert_docx_bytes_to_pdf()` 由 httpx POST 到
  Gotenberg `/forms/libreoffice/convert`,读环境变量 `GOTENBERG_URL`(默认 `http://gotenberg:3000`)。
- compose 新增 `gotenberg` 服务(`--api-timeout=120s`),backend `depends_on` 它。
- backend 镜像保持轻量(~400MB),Dockerfile 不装任何 office/字体重型依赖。
- 唯一调用点:`/agreement/pdf`、`/income-certificate/pdf`(打印)。下载走 docx,不转 PDF。

## 生产环境关键约束(踩过的坑,务必记住)

生产 hr-test(192.168.10.13)是**公司内网**,DNS `192.168.2.20` **解析不了任何公网
docker 镜像域名**(dockerhub / daocloud / 1panel / 腾讯云内网 mirror 全 `no such host`)。
→ **镜像和字体都拉不下来,只能本地准备好再传服务器离线导入。**

本地导出镜像又踩坑:**Docker Desktop 启用 containerd 镜像存储时,`docker save` 导出的
tar 是空壳**(只有 manifest,blob 全 0)。绕过办法:

```bash
# 本地(Windows)
docker create --name tmp gotenberg/gotenberg:8
docker export tmp -o gotenberg8_fs.tar   # 导文件系统,约 1.6GB
docker rm tmp
# 传到服务器后 import,并补回元数据(export 会丢 ENTRYPOINT/CMD/ENV/EXPOSE)
docker import \
  --change 'ENTRYPOINT ["/usr/bin/tini","--"]' --change 'CMD ["gotenberg"]' \
  --change 'USER gotenberg' --change 'WORKDIR /home/gotenberg' --change 'EXPOSE 3000' \
  --change 'ENV PATH=...' (含 LIBREOFFICE_BIN_PATH/CHROMIUM_BIN_PATH 等十余个) \
  /tmp/gotenberg8_fs.tar gotenberg/gotenberg:8
```

传大文件用 **MobaXterm 左侧 SFTP 面板**(用户习惯工具)。

## 真中文字体(不入库)

容器只有 Noto CJK,会顶替宋体导致行高漂移。把 Windows 真字体装进 Gotenberg:

- 字体在 `C:\Windows\Fonts\`:simsun.ttc / simhei.ttf / simkai.ttf / simfang.ttf / msyh.ttc(共约 67MB)。
- 放仓库 `hr-portal/backend/docker/fonts/`,但 **`.gitignore` 排除 `*.tt*`**(微软版权,不入库),
  目录靠 `README.md` 占位。生产单独用 MobaXterm 传到同名目录。
- compose 给 gotenberg 挂载 `./backend/docker/fonts:/usr/share/fonts/truetype/custom:ro`。
- 部署后必须 `docker compose exec gotenberg fc-cache -f` 刷新,`fc-list | grep -i simsun` 确认。

## 三处预览统一(高组件化)

协议 / 收入证明 / 模板维护三处预览统一成共享组件,改一处三处生效、未来新模板自动套用:

- `frontend/src/components/document/DocumentPaperPreview.vue` — A4 纸 + contenteditable +
  统一 `agr-*`/`cert-*` 排版样式。命令式接口 `setHtml()`/`getHtml()` + `@dirty` 事件。
- `frontend/src/utils/printPdf.ts` 的 `printPdfBlob(blob)` — 隐藏 iframe 静默打印,
  补偿金与收入证明共用,后续任何文档功能拿到 PDF blob 直接调。
- **用户已知情决定**:预览保留 HTML 自由编辑(经常改正文),接受预览"看不出真实页数、
  不反映模板真实排版"——这是 HTML 的死限,只有 PDF 预览能做到,但那样不能编辑。详见
  对话取舍。打印(PDF)才是各模板真实样子。

## 协议打印 3 页 → 2 页的真相

排查结论(别再误判):**不是纸张、不是字体替换**。模板本身是 A4,真因是
**正文用了 1.5 倍行距(`w:line=360`)+ LibreOffice 行高算法比 Word 偏大**,内容卡 2 页
边界就溢到第 3 页。无段前段后间距。

解法在 `document_templates.py`:
- `render_docx_template`(原 docx 保真打印)渲染时**强制 section A4** + `_cap_line_spacing()`
  把 >1.3 倍的倍数行距压到 1.3(只压 float 倍数,不碰固定值行距/段距)。实测 1.5→3 页、
  1.35→2 页,压到 1.3 留余量。
- 这一处对所有上传模板(协议/收入证明/未来新模板)自动生效。
- 后端 4 处渲染路径全部统一 A4:`render_preview_html_docx`/`render_docx_template`/
  `agreement.render_docx`/`income_certificate.render_docx`。
- LibreOffice ≠ Word 是固有差异,无法像素级一致(服务器装不了正版 Word)。

## 生产部署差异已纳入仓库(根治反复挡 pull)

以前生产手改 compose 未入库,每次 `git pull` 冲突。本次正式纳入 `docker-compose.yml`:
- db 端口绑 `127.0.0.1:5432`(不对公网)
- backend 去掉对外 `8000`(走前端 nginx 反代)
- backend 注入 `SECRET_BOX_KEY`
- frontend 端口改 `${FRONTEND_PORT:-8080}`,**生产 `.env` 设 `FRONTEND_PORT=37801`**(用户固定用 37801)

## 部署命令(代码更新,字体/compose 已就位时)

```bash
cd /opt/hr-portal/hr-portal && git pull origin main && docker compose up -d --build
```

首次或换字体后追加:`docker compose exec gotenberg fc-cache -f`
