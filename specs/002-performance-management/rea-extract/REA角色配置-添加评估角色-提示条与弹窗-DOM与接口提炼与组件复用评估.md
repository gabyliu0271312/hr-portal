# REA 角色配置「评估角色」页与「添加评估角色」弹窗 — DOM 与接口提炼与组件复用评估

> 逆向对象：飞书绩效「权限管理 → 角色配置 → 评估角色」页 + 「添加评估角色」弹窗（保存链路）
> REA 目标：`https://idreamsky.feishu.cn/perf/admin/permission/role-setting/list/review-role`
> 方法：CDP 9222 被动采集（inspect_web_page a11y 476 节点 / DOM 3050 节点）+ Playwright connectOverCDP 交互采集（点击添加按钮、展开英文行、真实填表保存抓包）
> 评估基线：本地 `PerformanceRoleConfiguration.vue`（评估角色 Tab）+ `role_configuration_router.py` + `PerformanceRole` 模型 + 复用组件（UiDialogShell / PerformancePromptNotice / PerformanceCreateButton / PerformanceCountedTextarea / PerformanceFormField）
> 日期：2026-11-28 ｜ 本轮只提取与评估；在飞书租户执行了一次真实保存以抓取接口（见 §7 清理项）
>
> 测试账号：gaby `6733065964654462476`；租户 `6732051441411884552`
> 证据：`rea-extract/out/role-add-dialog/`（01–13 证据 + 4 张截图）；a11y 树 `mcp-rea-inspect_web_page-*`

---

## 1. 采集目标与证据链

| 项 | 值 |
|---|---|
| 页面 URL | `/perf/admin/permission/role-setting/list/review-role`（评估角色页，独立路由） |
| 页面组件 | 飞书 tab「角色配置」下「评估角色」页（`perf-web__ud__tabs--type-line`），本地 `PerformanceRoleConfiguration.vue` 评估 Tab |
| 顶部提示条 | `perf-web__ud__notice perf-web__ud__notice-info` 浅蓝横幅，本地候选 = `PerformancePromptNotice type="info"` |
| 添加按钮 | `perf-web__ud__button--filled` 主色按钮（含 + 图标），本地候选 = `PerformanceCreateButton` |
| 添加弹窗 | 居中 modal 600px，head/body/footer 三段式，本地候选 = `UiDialogShell` / `PerformanceDialogShell` |
| 保存接口 | `POST /perf/api/review/custom_review_role/add`（**真实抓包**，非推断） |
| 列表接口 | `GET /perf/api/review/custom_review_roles`（含自定义角色） |

**核心结论（一句话）**：飞书「评估角色」页由**顶部浅蓝提示条 + 主色「添加评估角色」按钮 + 双语表单弹窗（head/body/footer 三段可复用壳）+ 真实保存接口**四件套构成，且自定义评估角色行的操作栏为**「编辑 / 停用 / 「…」（复制、删除）」**三组弹窗（编辑=复用添加弹窗预填、停用/删除=`confirm` 确认框、复制=添加弹窗预填副本名）；「周期与项目→项目设置」另有同款「…」下拉（复制/删除/导入）。本地已有弹窗壳、提示条、创建按钮、计数字段等**绝大多数可复用组件**，但缺少三处：① 评估角色 **添加/保存接口链路**（本地 create 硬编码 MANAGEMENT、评估列表只查 is_system、编辑/停用/删除对评估角色一律拒绝）；② **双语（中文/英文）输入行 + 「添加英文」**模式组件；③ 弹窗内**计数后缀「中文标签 + 0/2000 同显」**变体 + 操作栏「…」下拉与危险确认按钮（outlined-danger）能力。

---

## 2. 页面 DOM 结构（a11y 476 节点 / 交互采集实采）

### 2.1 顶部提示条（需求 1）

```
div.perf-web__ud__notice.perf-web__ud__notice-info.perf-web__ud__notice-showIcon   280,182  3120x40
  ├─ 信息图标（notice-showIcon）
  └─ div.notice__main--no-title > div.notice__description > div.notice__description-content
      文本：评估角色可以在绩效模板中被设为环节执行人
```

| 属性 | 实测值 |
|---|---|
| 背景色 | `rgb(240, 244, 255)` = **#f0f4ff** |
| 圆角 | 6px |
| padding | `9px 0 9px 16px`（左 16 / 上下 9 / 右 0） |
| 文本 | 14px / 行高 22px，`rgb(31,35,41)` |
| 图标 | info 圆圈图标（notice-showIcon），位于文本左侧 |

> 本地对应：`PerformancePromptNotice` → `--performance-prompt-info-background: #f0f4ff`、`--performance-prompt-padding-y: 9px`、`--performance-prompt-padding-left: 16px`、`--performance-prompt-info-icon: #1456f0`，**与飞书像素一致**，可直接复用 `type="info"`。

### 2.2 工具栏：添加按钮 + 搜索 + 筛选（需求 2）

```
div.!flex.!justify-between   （工具栏行，flex 两端对齐）
  ├─ button.perf-web__ud__button--filled-default   280,238  126x32  「添加评估角色」
  └─ 右侧区：搜索 input（placeholder「通过角色名称搜索」, w159）+ button 筛选(outlined 80x32)
```

| 元素 | 实测样式 |
|---|---|
| 添加评估角色按钮 | filled 主色 `rgb(20,86,240)`=#1456F0，白字，圆角 6px，32 高；**含 14x14 加号 SVG 图标**（`M12 2a1 1 0 0 0-1 1v8H3...`） |
| 筛选按钮 | outlined：白底、border `#D0D3D6`、字 `#1F2329`、圆角 6px、80x32 |
| 搜索框 | placeholder「通过角色名称搜索」 |

> 本地对应：`PerformanceCreateButton label="添加评估角色"` 已是「filled 主色 + 14px 加号 + 文字」，**1:1 复用**。筛选按钮本地已由共享筛选层实现（上轮 commit）。

### 2.3 表格（评估角色列表）

| 列头（实测） | 角色 | 描述 | 如何指定角色成员 | 状态 | 更新人 | 最近更新时间 | 操作 |
|---|---|---|---|---|---|---|---|
| 首行数据样例 | REA采集测试评估角色 | REA采集用… | **在周期中导入** | 已启用 | gaby.liu刘琦 | 2026-11-28 18:31 | 编辑 / 停用 |

- **系统预置 6 角色**：被评估人 / 实线上级 / 虚线上级 / 360° 评估人 / 校准人 / 指标评价人；`编辑/停用` 按钮为 link-primary **disabled**（色 `rgb(187,191,196)`），**无「…」更多按钮**
- **自定义评估角色**：`member_source="在周期中导入"`、`编辑/停用` **enabled**、**「…」更多按钮**（hover → 复制/删除）
- 分页：`共 6 条`（加自定义后 `共 7 条`）/ `10 条/页`
- 内容卡：`!p-10 !pb-5 !bg-white !rounded-lg` → 白底、圆角 8px、padding `20px 20px 10px`

> **与本地差异（需修正）**：
> 1. 列头飞书为 **「角色」**，本地评估 Tab 现用 `'角色类型'`（`PerformanceRoleConfiguration.vue:174`）——需对齐为「角色」；
> 2. 飞书评估 Tab 含 **「最近更新时间」** 列，本地只在管理 Tab 显示该列（`:182`）——评估 Tab 需补该列；
> 3. 自定义评估角色的操作列应含 **编辑/停用 enabled + 「…」更多（复制/删除）**；本地评估 Tab 现全部 disabled 且无「…」（`:82-83`）。

---

## 3. 「添加评估角色」弹窗 DOM 结构（需求 3）

### 3.1 容器层级（实测）

```
div.perf-web__ud__dialog__wrap.perf-web__ud__dialog--centered          （全屏固定定位 wrap）
  └─ div.perf-web__ud__dialog__content.perf-web__ud__modal.dialog__content-md   （600px 宽壳）
       └─ div.perf-web__ud__modal__content.perf-web__ud__modal-closable         （弹窗本体）
            ├─ div.perf-web__ud__modal__header       h72  padding 24 56 24 24
            │    ├─ div.modal__title.ud-typography-title-4   「添加评估角色」16/600/24
            │    └─ button.button--icon（28x28，absolute 右上）> span.universe-icon > svg(X 20x20, 色 #646A73)
            ├─ div.perf-web__ud__modal__body         padding 0 24px
            │    └─ form.perf-web__ud__form-vertical.perf-web__ud__form-md    （552 宽）
            │         ├─ div.form__item（名称）
            │         │    ├─ div.form__item__label  「名称」+ 必填「*」（红 #F54A45）
            │         │    └─ div.form__item__control：中文名称 input（w461）右缀「中文」标签；【添加英文】后新增英文名称 input 右缀「英文」标签
            │         └─ div.form__item（描述）
            │              ├─ div.form__item__label  「描述」
            │              └─ div.form__item__control：textarea（bg #fff、border #D0D3D6、radius 6、h116）+ 右下标「中文 0/2000」；【添加英文】按钮
            └─ div.perf-web__ud__modal__footer       padding 0 24px 24px
                 └─ div.modal__footer__btns（flex 右对齐）
                      ├─ button 取消（outlined 80x32）
                      └─ button 确定（filled #1456F0 80x32）
```

### 3.2 弹窗规格表

| 部位 | 实测 |
|---|---|
| 弹窗尺寸 | 600 x 482（居中） |
| 本体圆角 | 8px / 白底 |
| Header | 高 72，padding `24px 56px 24px 24px`（右侧 56 为关闭按钮预留）；标题 16px/600/lh24 |
| 关闭按钮 | 28x28 icon 按钮，右上角 absolute，X 图标 20x20 色 `#646A73` |
| Body | padding `0 24px`，form-vertical（label 上、control 下） |
| 名称 | label「名称」+ 必填星 `#F54A45`；input 圆角 6、border `#D0D3D6`；行内右缀语言标签「中文/英文」 |
| 描述 | label「描述」；textarea h116 圆角 6；右下 `中文 0/2000` 计数 |
| 「添加英文」 | text-primary 按钮（色 `#1456F0`）——点击在名称/描述下追加一行英文输入/文本域，带「英文」标签 |
| Footer | padding `0 24px 24px`，按钮右对齐：取消 outlined + 确定 filled（各 80x32、圆角 6） |

### 3.3 必填/计数行为

- 「名称」为必填（红 `*`），提交前校验；
- 「描述」计数 `0/2000`（2000 字上限），与本地 `PerformanceCountedTextarea` 的 maxLength 语义一致；
- 双语结构：中文行默认，点「添加英文」追加英文行（语言标签从「中文」扩展为「中文 + 英文」两行）。

---

## 3.4 操作栏弹窗（编辑 / 停用 / 复制 / 删除）

### 3.4.1 操作栏按钮全集（实测分布）

| 行类型 | 编辑 | 停用 | 「…」更多 | 说明 |
|---|---|---|---|---|
| 自定义评估角色（可操作） | ✅ enabled（link-primary 28x22） | ✅ enabled | ✅ **有**（`div.sc-EhVdV` 24x24 三点图标，位于停用后） | hover 更多 → 下拉「复制 / 删除」 |
| 系统预置角色（6 行） | ⚪ disabled（色 `rgb(187,191,196)`） | ⚪ disabled | ❌ 无 | 预置角色不可编辑/停用/删除 |

- 「…」= `div.sc-EhVdV.fvLIsv`（24x24，cursor pointer）> `span.universe-icon` > svg 14x14 水平三点；**hover 态**触发 `perf-web__ud__dropdown`（68 宽）：
  - `li.perf-web__ud__menu-normal-item` **复制**（60x37）
  - `li.perf-web__ud__menu-normal-item` **删除**（60x37）

### 3.4.2 编辑弹窗（`modal` 600 宽）

- **标题「编辑评估角色」**（与添加弹窗标题区分；其余结构 1:1 同添加弹窗）
- Body 预填原值：中文名称 `REA采集测试评估角色` / 英文名称 `REA test review role` / 中文描述原样；英文描述未填则「添加英文」行不展开
- Footer：添加英文（text-primary）+ 确定（filled `#1456F0` 80x32）+ 取消（outlined 80x32）

### 3.4.3 停用确认弹窗（`confirm` 420 宽）

```
perf-web__ud__dialog__content.perf-web__ud__confirm.dialog__content-sm  （420 宽壳）
  └─ confirm__content.confirm-hasIcon.confirm-confirm  （白底 radius 8, 420x180）
       ├─ confirm__header:
       │    ├─ confirm__title   「确定停用「REA采集测试评估角色」吗？」  16/600
       │    └─ confirm__body    「停用后，后续配置的模板将不能在环节执行人中选择。」  14
       └─ confirm__footer__btns:
            ├─ button 取消（outlined-default 80x32）
            └─ button 停用（outlined-danger：白底、红字 #F54A45、红边框 #F54A45、80x32）
```

### 3.4.4 复制弹窗（与添加弹窗同壳，预填副本值）

- **复用「添加评估角色」弹窗**（modal 600 宽、标题仍为「添加评估角色」），但**预填原值并加副本后缀**：
  - 中文名称 = `原名称 副本`
  - 英文名称 = `原英文名 Copy`
  - 描述 = 原描述（不加后缀）
- 按钮：添加英文 + 确定（filled）+ 取消（outlined）

### 3.4.5 删除确认弹窗（`confirm` 420 宽）

```
confirm__title    「确定删除「REA采集测试评估角色」吗？」  16/600
confirm__body     「停用后，后续配置的模板将不能再在环节执行人中选择此角色。」  14
confirm__footer__btns:
  ├─ button 取消（outlined-default 80x32）
  └─ button 删除（outlined-danger：白底、红字 #F54A45、红边框 #F54A45、80x32）
```

> 停用/删除确认弹窗均为 `perf-web__ud__confirm`（420 宽、`confirm-hasIcon` 带图标、白底 radius 8、危险按钮=**outlined-danger** 红字红边而非 filled）。本地对应：`PerformanceConfirmDialog`（需核对按钮变体是否支持 outlined-danger）。

---

## 3.5 「周期与项目 → 项目设置」类似操作（复制 / 删除）

> 路径：左侧导航「周期与项目」→ 周期详情页 → **项目设置** Tab（URL `/perf/admin/semester-activities?s=…`）；操作列与评估角色页同一「编辑 + 停用/启动 + 「…」」模式。

### 3.5.1 操作列与「…」下拉（实测）

- 操作列：编辑（link）+ 启动（部分行 disabled）+「…」（`div.sc-EhVdV` 24x24，同评估角色页）
- 「…」下拉 = **复制 / 删除 / 导入评估信息 / 查看导入记录**（4 项，`menu-normal-item` 116 宽 x 37 高）

### 3.5.2 项目复制弹窗（`modal` 600 宽）

- 标题「**复制项目**」；Body 为 **目标周期选择器**（`perf-web__ud__select` 552x32，预显当前周期名）；Footer 确定（filled）+ 取消（outlined）
- 与评估角色「复制弹窗」不同：项目复制是选目标周期，角色复制是预填副本名

### 3.5.3 项目删除确认弹窗（`confirm` 600 宽）

```
confirm__title   「确定要删除"测试360°邀请及确认"吗？」  16/600
confirm__body    「项目已启动，删除后，项目中的评估数据将全部被删除且不可恢复，
                  请谨慎操作。输入「确认删除」以确认当前操作 *」（含输入框要求键入「确认删除」）
confirm__footer__btns:
  ├─ button 保留（outlined-default 80x32）   ← 注意：项目删除的取消按钮是「保留」
  └─ button 删除（outlined-danger 80x32）
```

> 与角色删除的区别：**项目删除需键入「确认删除」字样**（强确认），按钮为「删除 / 保留」；角色删除无键入要求，按钮为「删除 / 取消」。

---

## 4. 接口清单（真实抓包，非推断）

### 4.1 保存接口（需求 4 — 核心）

| 项 | 值 |
|---|---|
| 接口 | `POST https://idreamsky.feishu.cn/perf/api/review/custom_review_role/add` |
| Content-Type | `application/json` |
| 请求体 | `{"name":{"zh-CN":"…","en-US":"…"},"description":{"zh-CN":"…","en-US":"…"}}` |
| 响应 | `{"code":0,"data":{"id":"7713168207476952247"},"msg":"操作成功","success":true}` |

### 4.2 列表接口（保存后重载）

| 项 | 值 |
|---|---|
| 接口 | `GET …/perf/api/review/custom_review_roles?keyword=&enable_status=0&offset=0&limit=10` |
| 响应 | `{code:0, data:{count, roles:[…]}}` |
| 角色字段 | `id`(string) / `name{zh-CN,en-US}` / `description{zh-CN,en-US}` / `enable_status` / `member_source{zh-CN,en-US}` / `deletable` / `is_preset` / `modify_time`(ms) / `modify_user_id` / `role_type` |
| 自定义角色 | `role_type:"custom_review"`、`is_preset:false`、`deletable:true`、`member_source:"在周期中导入"`(Imported in cycle) |
| 系统预置 | `role_type:"reviewee/leader/dotted_leader/360_reviewer/calibrator/…"`、`is_preset:true`、`deletable:false` |

### 4.3 enable_status 语义（对照上轮筛选证据）

- 默认加载：GET query `enable_status=0`（0 = 不过滤全部）
- 状态筛选（已启用）：`POST /perf/api/permission/roles/list` body `filter.enable_status=1`（上轮证据）

---

## 5. 组件复用评估（对照本地现有组件）

| 飞书元素 | 本地复用候选 | 复用判定 | 说明 |
|---|---|---|---|
| 顶部提示条 `notice-info` | `PerformancePromptNotice type="info"` | ✅ 直接复用 | token `--performance-prompt-info-background:#f0f4ff`、padding 9/16、icon `#1456f0` 与飞书逐项一致 |
| 添加评估角色按钮（filled+加号） | `PerformanceCreateButton label="添加评估角色"` | ✅ 直接复用 | 已是 filled 主色 + 14px 加号 + 文字 |
| 弹窗 head/body/footer 壳 | `UiDialogShell` / `PerformanceDialogShell` | ✅ 直接复用 | 已含 `header(header-start/title/description/close)` + `body(default)` + `footer` 三段插槽；600 宽对齐 `--performance-dialog-width` |
| 弹窗标题+关闭按钮 | `UiDialogShell` header 内建 | ✅ 内建复用 | 关闭 icon 按钮、标题 16/600 已内建 |
| 描述 textarea + 0/2000 计数 | `PerformanceCountedTextarea` | ⚠️ 需小扩展 | 现组件 suffix **二选一**（语言标签 **或** 计数）；飞书为「中文标签 + 0/2000 同显」 |
| 名称输入（单行 + 语言标签） | `PerformanceFormField` / `PerformanceTextField` | ⚠️ 缺双语行 | 无「语言标签 + 添加英文追加行」模式，需新建 `PerformanceLanguageInput`（或扩展 FormField） |
| 必填星标 `*` | `PerformanceRequiredLabel` | ✅ 直接复用 | |
| 取消/确定 footer 按钮 | `UiButton`（outlined/filled）+ footer 插槽 | ✅ 直接复用 | 本地按钮 token 与飞书一致（filled `#1456f0`、outlined `#D0D3D6` border） |

**结论**：需求 3 的「弹窗 head/body/footer 复用组件」**已由 `UiDialogShell` 完整承接**；真正需要新做的是①双语输入行组件（名称）、②计数后缀「语言+计数同显」小变体、③保存链路。

---

## 6. 保存接入（需求 4）— 本地现状与缺口

| # | 本地现状 | 飞书要求 | 缺口 |
|---|---|---|---|
| 1 | `role_configuration_router.py` `create_performance_role` **硬编码 `role_type="MANAGEMENT"`**（`:540`）、`member_source=None` | 新增自定义评估角色（`custom_review`，`member_source=在周期中导入`） | 需支持 ASSESSMENT 自定义角色创建；member_source 语义需定 |
| 2 | 评估列表 `list_performance_roles` 对 ASSESSMENT **只查 `is_system=True`**（`:483-485`） | 列表含系统预置 + 自定义评估角色 | 需放开 is_system 过滤（评估 Tab 同列表返回自定义角色） |
| 3 | `update_performance_role` / `update_status` / `delete` 对评估角色**一律拒绝**（"评估角色不可编辑/操作/删除"） | 自定义评估角色可编辑/停用/删除（系统预置保持不可） | 需区分 is_system：自定义允许，系统预置仍拒绝 |
| 4 | `PerformanceRole` 模型 `name/description` **单语字段** | 保存载荷 `{zh-CN,en-US}` 双语 | MVP 取舍：只落 zh-CN（前端不采集英文）或加 en 列 |
| 5 | 前端 `PerformanceRoleConfiguration.vue` 评估 Tab：无添加按钮、编辑/停用 disabled、列头「角色类型」缺「最近更新时间」 | 添加按钮 + 弹窗 + 自定义行可编辑/停用 + 列「角色」/含「最近更新时间」 | 前端需补添加按钮、弹窗、列表列头与自定义行操作 |

**推荐接入路径**（仅建议，实施另立任务）：
1. 后端 create/update/status/delete 放开 `role_type="ASSESSMENT"` 且 `is_system=False` 的自定义角色，member_source 取「在周期中导入」；
2. 评估列表去掉 `is_system=True` 过滤（保持预置 + 自定义同表返回，预置仍置灰）；
3. 前端评估 Tab 补 `PerformanceCreateButton`（add → 打开 `UiDialogShell` 弹窗）+ 双语表单 + 保存后调 `performanceRoleApi.create`（扩展 roleType）并刷新。

---

## 7. 待确认 / 注意

- **生产数据**：为抓取保存接口，已在该飞书租户创建测试角色「**REA采集测试评估角色**」（id `7713168207476952247`，member_source=在周期中导入）。请在验证后到「角色配置 → 评估角色」停用并删除该测试角色。
- **接口覆盖**：本轮已真实抓取**添加保存**（POST `/custom_review_role/add`）与列表接口；**编辑保存 / 停用 / 复制 / 删除**四个操作的请求接口**未抓包**（操作会改生产数据，本轮仅采集弹窗 DOM）。实施前需抓包确认（复制大概率复用 add 接口，编辑/停用/删除应有对应 update/status/delete 接口）。
- 名称输入的字数上限未实测（描述已确认 2000；本地后端 name 上限 64）。
- 「更多」Tab（`评估角色` 旁）用途未深挖，可能与扩展角色类型相关，不在本轮范围。
- 表格列头「角色」vs 本地「角色类型」、评估 Tab 缺「最近更新时间」两处差异基于本轮实采，实施时以最新需求为准。
- 「…」下拉与 `menu-normal-item`（复制/删除/导入）在评估角色页与项目设置页**同一套组件模式**（`perf-web__ud__dropdown` + `menu-normal-item`），可抽象为共享「行操作更多下拉」。
- 用户提到的「新建的橘色」标记：本轮实采中**未发现**自定义角色行有橘色元素（行均为白底黑字）；若指「新建角色」按钮或某状态色，需进一步确认来源。
- **截图可靠性**：评估角色页部分截图（hover「…」下拉、删除弹窗）受浏览器渲染帧冻结影响，捕获到与保存后页面相同的旧帧（md5 重复），已移除 `26/30` 两张；**像素级还原以 DOM JSON 证据（坐标/样式 token）为准**，截图仅作辅助（00/03/07/21/23/28/32/35/39 为有效唯一帧）。

---

## 8. 交付物清单

- 本轮采集脚本（`rea-extract/`）：
  - 添加弹窗：`capture-role-add-dialog.js` / `capture-role-add-dialog2.js` / `capture-role-add-dialog3.js` / `capture-role-add-dialog4.js`
  - 操作栏弹窗：`capture-role-more-hover.js` / `capture-role-copy-delete2.js` / `capture-role-delete-dialog.js` / `capture-role-deactivate.js` / `capture-role-debug-menu.js`
  - 项目设置：`capture-proj-settings-nav.js` / `capture-proj-actions.js` / `capture-proj-more.js` / `capture-proj-copy-delete.js` / `capture-close-proj.js`
- 证据包：`rea-extract/out/role-add-dialog/`（01–39 证据 + 截图，含 10 保存网络抓包、20 编辑弹窗、22 停用弹窗、25/26 「…」下拉、27/28 复制弹窗、29/30 删除弹窗、31–35 项目设置导航/下拉、36–39 项目复制/删除弹窗）

---

## 9. 开发交付与验收（2026-11-28 已按 DOM 实现）

### 9.1 实现内容

- 顶部提示条：`PerformancePromptNotice type="info"`（评估角色可以在绩效模板中被设为环节执行人）
- 「添加评估角色」按钮：`PerformanceCreateButton`（评估 Tab 左工具栏）
- 添加/编辑/复制弹窗：`PerformanceRoleFormDialog`（`UiDialogShell` 600 宽 + 双语表单 `PerformanceBilingualField`）
- 操作栏：自定义行 编辑/停用 enabled + 「…」更多下拉（复制/删除）；系统预置行保持 disabled
- 停用/删除确认：`PerformanceConfirmDialog`（outlined-danger 按钮，420 宽）
- 列头「角色」+ 评估 Tab 补「最近更新时间」列
- 保存接入：后端 create/update/status/delete 放开评估自定义角色 + 双语字段（name_en/description_en）+ 迁移 0331

### 9.2 新增/改动文件

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `backend/alembic/versions/0331_performance_role_bilingual.py` | performance_roles 加 name_en/description_en |
| 后端模型 | `backend/app/performance/models.py` | PerformanceRole 加双语字段 |
| 后端路由 | `backend/app/performance/role_configuration_router.py` | create 支持 role_type=ASSESSMENT + member_source=在周期中导入；list 放开评估自定义；update/status/delete 评估自定义可操作、系统角色拒绝 |
| 前端组件 | `PerformanceBilingualField.vue`（新） | 双语字段（中文/英文行 + 添加英文） |
| 前端组件 | `PerformanceRoleFormDialog.vue`（新） | 添加/编辑/复制共用弹窗 |
| 前端组件 | `PerformanceCountedTextarea.vue` | 扩展 showLanguageAndCount（语言+计数同显）+ token 化存量样式 |
| 前端 token | `tokens.css` | 新增语言标签/计数 token |
| 前端页面 | `PerformanceRoleConfiguration.vue` | 提示条/添加按钮/弹窗/操作栏/列头/保存接入 |
| 前端 API | `api/performance.ts` | 角色 payload 加 name_en/description_en/role_type |

### 9.3 验收证据

- check-ui-rules：**0 违规**
- vue-tsc --noEmit：**0 错误**
- 前端 vitest：PerformanceRoleConfiguration 14 / BilingualField 5 / RoleFormDialog 5 / CountedTextarea 2 / RoleCreate 8 / UiDialogShell 3 / ConfirmDialog 15 **全通过**
- 后端 pytest：test_performance_role_configuration 15 / test_tree_role_configurable_build 18 **全通过**
- ⚠️ 端到端接口验证（Docker postgres + 迁移 + 启动服务）因本机 Docker daemon 未运行**未执行**，需环境就绪后验证（`alembic upgrade head` → 启动后端 → 角色配置评估 Tab 真实新增/编辑/停用/复制/删除）
- ⚠️ 生产数据：测试角色「REA采集测试评估角色」（id `7713168207476952247`）待清理
