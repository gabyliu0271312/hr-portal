# HR Portal docx/打印预览后续处理备忘

日期：2026-06-16

## 当前结论

今天先暂停处理 docx/LibreOffice 打印链路，不再继续改代码。

目前已经确认：月度偏移和其他业务修复已经推送到仓库，并且已经部署到生产环境。docx/LibreOffice 相关改动因为会改 `backend/Dockerfile`，并引入 `libreoffice-writer`、`fonts-noto-cjk`、中文字体等重型依赖，生产服务器 apt 源拉取风险很高，所以暂时不继续上线。

## 功能说明口径

对外或明天继续处理时，不要把 LibreOffice 写成“当前已上线方案”。

准确口径是：

- 当前生产版本不包含 LibreOffice/docx 转 PDF 打印链路。
- LibreOffice 是今天为解决 Word 打印格式一致性而评估和短暂实现过的技术方案。
- 由于它会引入重型系统依赖，并触发生产 Dockerfile / apt 源 / build 稳定性风险，后续已从 `main` 剔除，暂缓上线。
- 当前已上线的是月度偏移和其他业务修复，不包含这条 docx 打印增强。

如果需要写功能点说明，可以写成：

> Word 模板预览/打印一致性问题已定位，LibreOffice 转 PDF 方案已验证可行但因生产构建风险暂缓上线；当前主线仅保留已部署的业务修复，docx 打印增强后续作为专项处理。

## 关键背景

用户原始诉求是：

- 系统设置 -> 模板维护：上传 Word 模板后，预览尽量保持原 Word 格式，并且可编辑保存。
- 提效工具 -> 补偿金计算：解除劳动合同协议书预览和打印要尽量保持原 Word 格式。
- 打印不能要求用户先下载 Word 再手动打印，仍希望从系统直接触发打印。

今天尝试过的技术方向：

- 用后端 `LibreOffice` 将 DOCX 转 PDF，再由浏览器直接打印 PDF。
- 这个方向可以解决浏览器 HTML 打印导致的页眉错位、2 页压成 1 页等问题。
- 但生产上线风险在 Docker 构建：需要安装 LibreOffice 和中文字体，包很大，国外 apt 源在生产服务器上基本不可用。

## 已发现的问题

1. 生产服务器本地曾手动改过 Dockerfile 换国内源。
   - 这些本地改动没有提交到仓库。
   - 仓库里的 docx/LibreOffice 改动也修改了 `backend/Dockerfile`。
   - 两边冲突后，`git pull` 会被挡住。

2. 即使解决 git pull 冲突，构建也可能失败。
   - `libreoffice-writer`
   - `fonts-noto-cjk`
   - `fonts-wqy-zenhei`
   - 这些依赖很大，生产服务器如果还走国外 Debian 源，大概率超时或失败。

3. 当前更稳妥的决策：
   - 先把 docx/LibreOffice 改动从 `main` 剔除。
   - 保留月度偏移和其他业务修复。
   - docx/LibreOffice 改动留在 git 历史里，之后单独做专项上线。

## 当前仓库状态线索

今天看到过的关键提交：

- `3df1141 feat: 员工月度花名册启用月度自动偏移，接口页按 period_source 通用识别`
  - 这个提交里混入了 docx/LibreOffice 改动。
  - 包含 `backend/Dockerfile`、`docx_convert.py`、模板预览/打印相关代码、中文字体配置、测试等。

- `bb02f92 revert: 移除 docx/LibreOffice 改动，保留 roster 月度偏移`
  - 今天后续看到 `main` / `origin/main` 已经在这个提交上。
  - 说明剔除 docx/LibreOffice 的 revert 已经存在。

明天接手时先执行：

```bash
cd /opt/hr-portal/hr-portal
git log --oneline -5
git status -sb
```

本地开发机也可在：

```bash
cd D:\AI项目\HR提效工具搭建
git log --oneline -5
git status -sb
```

## 明天优先要确认

1. 确认生产环境已经在安全提交上。

```bash
cd /opt/hr-portal/hr-portal
git log --oneline -3
git status -sb
```

期望看到最新提交类似：

```text
bb02f92 revert: 移除 docx/LibreOffice 改动，保留 roster 月度偏移
```

2. 确认生产环境 `git pull` 不再被 Dockerfile 冲突挡住。

如果生产仍有本地 Dockerfile 改动，需要先看差异：

```bash
git diff -- backend/Dockerfile frontend/Dockerfile docker-compose.yml
git status -sb
```

不要直接 `git reset --hard`，因为生产本地可能还有 `.env`、端口、国内源等部署差异。先确认哪些文件是本地部署必要改动。

3. 确认生产构建不再尝试安装 LibreOffice。

查看：

```bash
sed -n '1,80p' backend/Dockerfile
```

如果里面还有：

```text
libreoffice-writer
fonts-noto-cjk
fonts-wqy-zenhei
```

说明生产工作区还没回到安全版本，先不要 build。

4. 确认生产功能。

重点回归：

- 月度偏移配置是否还在。
- 接口页按 `period_source=inject` 识别月份设置是否正常。
- 菜单、`period_col`、模型重建、`cost_class`、批量启用等业务修复是否仍正常。

## 后续如果要重新上线 docx/打印

不要直接把 `3df1141` 里的 docx 改动再合回生产。建议单独开一条小分支处理部署可行性：

1. 先把国内源方案正式纳入仓库。
   - backend Dockerfile 支持 Debian 国内源。
   - pip 使用国内源。
   - frontend npm 使用国内源。
   - 不再依赖生产服务器手改 Dockerfile。

2. 再决定 LibreOffice 是否适合生产。
   - 优点：打印更接近 Word/PDF。
   - 缺点：镜像明显变大，构建慢，依赖源稳定性要求高。

3. 可选方案：
   - LibreOffice 做成单独转换服务镜像，不塞进主 backend。
   - 预构建 backend 镜像后推到内网镜像仓库，生产只 pull 镜像，不在生产 apt install。
   - 暂时保持 HTML 可编辑预览 + Word 下载，打印继续走当前安全方案。

## 明天不要忘记的风险点

- 生产服务器 Dockerfile 本地换源改动如果继续不入仓库，以后还会反复挡 `git pull`。
- docx 打印需求本身没否定，只是今天不适合带着重型依赖直接上生产。
- 如果以后要恢复直接打印，必须先解决“可重复构建”和“中文字体”两个问题。
