---
name: hr-portal-pitfalls
description: hr-portal 项目搭建期间踩过的坑与对应修复，避免下次重犯
metadata:
  type: project
---

# HR Portal — Phase 1 踩坑记录

**Why 记这条**：搭建 docker compose 三件套时连续踩了两个坑，单看是小事，但会让初始化体验从"5 分钟搞定"变成"半小时排错"。
**How to apply**：未来给业务用户搭新 Python+Docker 项目时按这两点预先避免。

## 坑 1：本机 80 端口被其他 Docker 项目占用

**现象**：`docker compose up` 报 `bind: address already in use`，但 `docker ps` 看不到 hr-portal 容器，因为根本起不来。

**根因**：用户的"成本分摊系统"还在 `docker compose up` 状态，它的 nginx 容器把宿主机 80 端口绑走了。

**修复**：hr-portal 把 frontend ports 从 `"80:80"` 改成 `"8080:80"`，访问 http://localhost:8080/。

**预防**：新建 docker-compose 项目前先 `docker ps --format "{{.Ports}}"` 看占用；为非主项目分配 8080/8888 这类备用端口。

## 坑 2：Dockerfile 第一阶段 COPY pyproject.toml 但未 COPY README.md，hatchling 校验崩溃

**现象**：`pip install -e .` 报：

```text
OSError: Readme file does not exist: README.md
ERROR: process "/bin/sh -c pip install --upgrade pip && pip install -e ." did not complete successfully: exit code: 1
```

**根因**：Dockerfile 早期阶段为利用 Docker 缓存，先 `COPY pyproject.toml ./`，但 pyproject.toml 声明了 `readme = "README.md"`，hatchling 在 metadata 阶段会校验该文件存在，构建上下文里此时还没 README → 失败。

**修复二选一**（已选第 1 种，最简单）：

1. **删掉 pyproject.toml 的 `readme = "README.md"` 字段**（hr-portal 用的方法）
2. 或在 Dockerfile 早期一并 `COPY pyproject.toml README.md ./`

**预防**：写 Python Dockerfile 时，pyproject.toml 里如果声明了 readme/license 等指向具体文件的字段，COPY 阶段必须把这些文件一起拷过去；或者干脆从 pyproject.toml 删掉这些 metadata 字段（小型内部项目用不到）。

## 坑 3：CSS Grid `1fr` 列被宽内容撑大，导致按钮跑出视口

**现象**：用户管理页（表格列宽合计 1120px）右上角「+ 新建用户」按钮要拖底部横向滚动条到最右才能看见；其他列窄的页面（角色、字段分类）正常。

**根因**：[Default.vue](../hr-portal/frontend/src/layouts/Default.vue) 的布局用 `grid-template-columns: 240px 1fr`，CSS Grid 的 `1fr` 实际是 `minmax(auto, 1fr)`——当子内容（表格）比列宽还宽时，列**会被内容反向撑大**，整个右侧主区域横向溢出，PageHead 的右上角按钮就被推到视口外。

**修复**：`1fr` → `minmax(0, 1fr)`，强制列不能超过父容器，溢出由内部组件（el-table 自带横向滚动）承担。Users.vue 顶层加 `min-width: 0` 配合传递约束。

**预防**：任何 Grid/Flex 容器内放可能很宽的子元素（表格、长 URL、code 块），都用 `minmax(0, 1fr)` 而不是 `1fr`；Flex 子项配 `min-width: 0`。这是企业级布局的标配套路。

**注**：2026-05-23 整体改成飞书风（el-card + 顶部 tabs + 左侧菜单）后，原侧边栏 grid 布局已废弃，但 `minmax(0, 1fr)` / `min-width: 0` 的认知依然适用其他 grid/flex 场景。

## 坑 4：el-table fixed="right" 操作列在窄屏失效（2026-05-23 调试 6+ 小时）

**现象**：用户管理页操作列「编辑/重置密码/禁用」3 个按钮显示不全或完全看不到。需要拖底部横向滚动条才能看到部分按钮。

**调试过程**（避免重蹈覆辙）：
1. ❌ 改 layout grid 1fr → minmax(0, 1fr)：解了页面横向溢出但表格内问题仍在
2. ❌ 加 `.hp-table-wrap` 外层 `overflow-x: auto`：拖动滚动条时表头不跟着体滚动，错位
3. ❌ 把 `width="160"` 改成 `min-width="140"`：EP 反向压缩列，表格宽度仍 = 容器宽度
4. ❌ 给 el-table 设 `style="width: 1280px"` 强制宽度：EP 内部还是把表格压回容器宽
5. ❌ 加中间层 `.hp-table-inner { width: 1280px }`：表格宽度对了，但 EP fixed-right 因为没启用滚动机制依然失效
6. ❌ 用 CSS `position: sticky` 自实现固定列：破坏 EP table layout，数据列错位
7. ✅ **加 `max-height="600"`**——这才是关键！

**根因**：EP 的 `fixed="right"` 列必须依赖**独立的 body-wrapper 滚动容器**才能 sticky。**只有设了 `max-height` 或 `height`，EP 才会创建 `el-table__body-wrapper` / `el-table__header-wrapper` / `el-table__fixed-right-wrapper` 这套 DOM 结构**。否则表格只有一��� wrapper，fixed 列直接降级为普通列。

**修复（标准方案，照抄成本分摊系统）**：
```vue
<div style="overflow-x: auto">
  <el-table
    :data="list"
    stripe
    style="width: 100%"
    max-height="600"             <!-- ← 这一行是命门 -->
  >
    <el-table-column prop="..." min-width="120" />
    <el-table-column label="操作" width="280" fixed="right">
      ...
    </el-table-column>
  </el-table>
</div>
```

外加全局 CSS（已加在 [styles/index.css](../hr-portal/frontend/src/styles/index.css)）：
```css
.el-table .cell {
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: unset !important;
}
```

**预防**：写任何带 fixed 列的 el-table 时第一件事就是设 `max-height`。**不要**用 sticky 自实现、不要用 min-width 的写法、不要在外层套多层 overflow 容器——所有这些都试过、都失败。直接复制 [Users.vue](../hr-portal/frontend/src/views/system/Users.vue) 当模板。

## 坑 5：Docker 容器修改 Python 代码后必须 `--build` 才生效

**现象**：改了 `app/datasources/beisen_client.py` 修复 token 接口，`docker compose restart backend` 后报错信息一字不差，仿佛代码没改。

**根因**：Dockerfile 在 build 阶段 `COPY . .` 把代码烧进镜像，restart 只是重启容器进程，**不会重新拷贝**宿主机代码。entrypoint 起的是镜像里的旧文件。

**修复**：改后端 Python 代码后必须：

```bash
docker compose up -d --build backend
```

`--build` 触发重新打镜像 + 重建容器。前端也是同理（前端走 nginx 静态文件，必须 rebuild 才能更新）。

**预防**：把这条写进每次后端改动的肌肉记忆。开发期可以考虑给 backend 挂 volume 实时同步代码，但生产构建必须保持当前的 COPY 模式。

## 坑 6：北森 token 接口的 Content-Type 要求

**现象**：调 `https://openapi.italent.cn/token` 报：

```text
{'error': 'invalid_request', 'error_description': '找不到 Content-Type', 'error_code': '400006'}
```

**根因**：北森 token 接口要 `application/x-www-form-urlencoded`。最初代码用了 `httpx.post(url, params={...})`，把参数放到 query string 里，请求 body 是空的，没有 Content-Type 头，北森拒绝。

**修复**：用 `data={...}` 而不是 `params={...}`。httpx 会自动对 `data=` 加 `Content-Type: application/x-www-form-urlencoded` 并把 dict 编码进 body。**不需要**手动设 header。

**预防**：调任何 OAuth 类 token 接口，永远用 `data=` 而不是 `params=`。

## 坑 7：北森 OpenAPI 受信 IP 白名单

**现象**：token 接口正常返回 200 + 拿到 access_token，但调 GridHeader / GridData 立即 403，body：

```text
当前企业已设置OpenAPI调用受信IP，当前调用端的IP不在受信IP范围内...当前请求IP：113.110.144.78
```

**根因**：北森企业租户后台开了 IP 白名单，token 接口不校验 IP 但业务接口校验。

**修复**：让租户管理员在「北森开放平台 → 应用管理 → IP 白名单」加入：

- 本地开发：当前公网出口 IP（错误信息里会告知）
- 生产服务器：固定公网 IP

**预防**：接入北森前先和租户管理员确认 IP 策略；本地拨 VPN 切公司出口 IP 也是一个绕开方法。

## 坑 8：北森报表 GridData 的请求规范

**现象**：照默认 OAuth 思维写成 POST + JSON body + 大驼峰字段名（ReportId/PageIndex/PageSize），北森报错或返回空。

**正确写法**（与成本分摊系统对齐，已验证可用）：

- 方法：**GET**
- 参数：query string，**小驼峰**（reportId / page / pageSize）
- 鉴权：`Authorization: Bearer {token}`
- 响应结构：`data.totalRecords` + `data.datas`（不是 `Data.Items`）
- 字段 key 是 UUID，需要单独调 `/Reports/GridHeader` 拿 columns，建 UUID → 中文 title 映射，把 row 的 key 翻译过来

**预防**：北森 OpenAPI 命名风格不统一，写客户端前先用 httpx 直接试一次响应结构。**不要凭直觉写**。

## 坑 9：数据层不要再写固定列 schema（C1 架构后）

**现象**：v1 时代每张业务表都把 employee_id / period_ym / cost_center 等业务字段写成物理列，结果北森报表实际字段是「工号 / 成本归属年月 / 维度值」等中文，sync 时 90% 字段映射不上、UI 全是 `—`。

**根因**：把"源端字段"和"本地物理列"绑死了。北森换 Report ID 或字段名，整个映射就崩。

**修复（2026-05-23 切到 C1 动态列架构）**：

- 业务表只保留 `pk_hash + raw + synced_at`，所有字段进 raw JSONB
- 字段元数据存到 `table_columns` 表，同步时自动发现
- 业务主键由 `table_columns.is_pk_part=true` 的列动态决定
- 详见 [[hr-portal-system]] 「数据层架构」一节

**预防**：未来新接入数据源（飞书/企微/SAP 等）一律不动 schema，新字段在字段管理页（`/system/field-columns`）配。**禁止给 5 张业务表加任何固定业务列**——加了就是历史遗留。

## 坑 10：PowerShell Invoke-RestMethod 发中文 body 会双重编码污染数据库

**现象**：直接用 PowerShell `Invoke-RestMethod -Body $payload` 调 API 写入带中文的字段（如 `schedule="每月 1 日 06:00"`），库里存的字符是 `æ¯æ 1 æ¥ 06:00`，前端显示为 `每���� 06:00`（带 U+FFFD 替换字符）。

**根因**：PowerShell（尤其 5.1）的 `Invoke-RestMethod` 默认按 ANSI/GB2312 序列化 string body，FastAPI/Pydantic 接收时按 UTF-8 解码。中文字节 `0xE6 0xAF`（"每"）被错误当成 Latin-1 单字节解读 → 转 UTF-8 时变成 `0xC3 0xA6 0xC2 0xAF` 双重编码；如果遇到 GB2312 没有的字节序列还会被替换字符吃掉，**信息丢失不可逆**。

**修复**：

- 一次性已污染的数据：直接 `psql` 里 `UPDATE` 改回（容器内 psql 是 UTF-8 干净的）
- 以后用 PowerShell 调 API：必须显式 UTF-8 编码 body

```powershell
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri $url -Method Put -Headers $headers -Body $bytes `
  -ContentType 'application/json; charset=utf-8'
```

**预防**：调试时优先用 `curl.exe`（Win10+ 自带）或在容器内 `docker exec ... python -c` 调，避免触雷。前端通过浏览器调 API 是 UTF-8 干净的，不会有此问题。

## 坑 11：前端 `--build` 命中 Docker 层缓存 → 改了源码容器里还是旧 JS

**现象**：改了前端 .vue/.ts 源码，跑了 `docker compose up -d --build frontend`，浏览器里行为完全没变（下拉没恢复、UI 没更新）。看起来像"代码没改"，实则改了但没编译进容器。

**根因**：前端 Dockerfile 是多阶段容器内构建（`COPY . . && npx vite build`），理论上改源码该重编。但 `docker compose --build` 会复用 Docker 层缓存——某些情况下 `COPY . .` 这层的缓存判定没失效（或整个 build 阶段命中缓存被跳过），nginx 镜像里仍是上次编译的旧 dist。坑 5 说的"要 --build"是对的，但 **--build 不等于一定重新编译**。

**如何确认容器跑的是新是旧**（关键诊断手法,照抄）：
```bash
# 进容器搜编译产物里是否含"已删除的旧代码特征"或"新增的代码特征"
docker compose exec -T frontend sh -c 'cd /usr/share/nginx/html/assets && grep -rl "已删除的旧标识符" . '
# 例:本次删了 _shortAlias 里的 costclass 映射,旧产物里还能 grep 到 costclass = 没编译进去
```
注意 Git Bash 会把容器内 `/usr/...` 路径改写成 `C:/Program Files/Git/usr/...`，必须用 `docker compose exec -T frontend sh -c '...'` 在容器内 shell 里跑 grep，不要直接 `exec ls /usr/...`。

**修复**：强制无缓存重建。
```bash
docker compose build --no-cache frontend && docker compose up -d frontend
```

**预防**：前端改源码后,只要浏览器行为没变,第一时间用上面的 grep 法验证容器产物,而不是反复怀疑"代码没生效"去重改源码。确认是缓存就 `--no-cache`。后端同理(坑 5)但后端 Python 是直接 COPY 源码,缓存失效更敏感,前端因为多了 npm/vite 层更容易命中缓存。


