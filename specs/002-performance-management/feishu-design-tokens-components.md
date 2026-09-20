# 飞书绩效界面 · 设计 Token 与组件清单（参照提炼）

> 来源：Perfect-Web-Clone-IDE 采集 `idreamsky.feishu.cn/perf/admin/review-questions/review-indicators`（评估题页）+ `perf/admin/templates`（模板管理页）。
> 产物：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260824_182446\captures\`
> 证据：`static_design_evidence.json`（794 语义变量 / token 频率 / 817 元素）、30 个交互状态（11 hover + 19 click）。
> 用途：对齐 `hr-portal/frontend/src/styles/tokens.css`，并作为绩效模块「评估题」页面组件化开发的清单。

## 五、提炼落地状态

本清单中的像素证据按以下规则落地，不把页面专属测量值误升为平台规范：

- **全局基础/语义 Token** 已统一落到 `hr-portal/frontend/src/styles/tokens.css`；
- **绩效组件 Token** 使用 `--performance-*` 命名，承载输入框、开关、复选框、计数器、图标按钮和确认弹窗等共享组件的稳定值；
- **共享组件** 已优先收敛到 `hr-portal/frontend/src/components/performance/`，包括表单控件、操作按钮、全屏业务壳、执行人选择器和内容预览器；
- **页面局部值**（例如特定流程画布、右侧面板、弹层定位和节点宽度）继续保留在页面 CSS 或 UI contract，不作为全局 Token；
- 本次提炼保持既有视觉值和交互行为不变，目标是让后续页面默认达到统一的 P1 视觉基线；
- 像素级 P2 仍以对应状态的完整采集证据、rendered contract 和截图 diff 为准。

后续新增页面时，先查阅 `frontend/docs/design-system.md` 的 Token 分层和绩效共享组件清单，再决定是否新增 Token 或组件。

---

## 一、设计 Token 提炼

### 1.1 色板对照（飞书真实值 vs 现有 tokens.css）

| 语义 | 飞书真实值 | 现有 tokens.css | 结论 |
|---|---|---|---|
| 主色 primary | `rgb(51,112,255)` = `#3370ff` | `--color-primary: #3370ff` | ✅ 一致 |
| 主色 hover | `rgb(20,86,240)` = `#1456f0` | `--color-primary-hover: #2855cc` | ⚠️ 有差异，建议改 |
| 主色 active | `rgb(36,91,219)` = `#245bdb` | `--color-primary-active: #1f4fb8` | ⚠️ 有差异，建议改 |
| 正文文字 | `rgb(31,35,41)` = `#1f2329`（1195 次） | `--color-text-primary: #1a2233` | ⚠️ 建议改 |
| 次要文字 | `rgba(0,0,0,0.65)`（2294 次，最高频） | `--color-text-regular: #374151` | ⚠️ 语义不同，飞书正文即 65% 黑 |
| 占位符 | `rgb(143,149,158)` = `#8f959e` | `--color-text-placeholder: #9aa5b4` | ⚠️ 建议改 |
| 边框（常规） | `rgb(187,191,196)` = `#bbbfc4` | `--color-border: #e4e9f0` | ⚠️ 飞书边框更深 |
| 分隔线 | `rgb(208,211,214)` = `#d0d3d6` | `--color-border-strong: #d0d7e2` | ✅ 接近 |
| 页面背景 | `rgb(245,246,247)` = `#f5f6f7` | `--color-bg-page: #f4f6f9` | ✅ 接近 |
| 链接蓝 | `rgb(24,144,255)` = `#1890ff` | 无 | ➕ 需补 `--color-link` |
| 危险色 | `rgb(216,57,49)` = `#d83931` | `--color-danger: #f04438` | ⚠️ 建议改 |

### 1.2 字号阶梯

飞书正文 **14px/400 绝对主导**（740 次），标题用 16/18/20px + 600 字重。

| 用途 | 飞书值 | 现有 tokens.css |
|---|---|---|
| 辅助/说明 | 12px | `--font-size-xs: 12px` ✅ |
| 正文 | 14px/400 | `--font-size-md: 14px` ✅ |
| 小标题 | 16px/600 | `--font-size-lg: 16px`（缺字重语义） |
| 弹窗标题 | 18px/600 | 无，建议补 |
| 页面大标题 | 20px/600 | `--font-size-xl: 20px` ✅ |

### 1.3 间距阶梯

飞书：`4 / 8 / 10 / 12 / 16 / 20 / 24 / 32`（4 的倍数，多一个 **10px**）。
现有 tokens.css：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40`（缺 10px，多 40px）。
➡️ **建议补 `--spacing-25: 10px`**（飞书大量用 10px 做紧凑间距）。

### 1.4 圆角

| 用途 | 飞书值 | 现有 |
|---|---|---|
| 弹窗/大容器 | 32px（29 次） | 无，建议补 `--radius-2xl: 32px` |
| 卡片/输入框 | 6px（22 次） | `--radius-md: 6px` ✅ |
| 胶囊/按钮/标签 | 999999px（12 次） | `--radius-pill: 999px` ✅ |
| 常规 | 8px / 12px | `--radius-lg: 8px` ✅ |

### 1.5 阴影

飞书阴影统一用 `rgba(31,35,41,α)` 多层叠加，弹窗阴影：
```
--shadow-s2: 4px 0 16px 4px rgba(31,35,41,0.03),
             4px 0 8px 0 rgba(31,35,41,0.02),
             2px 0 4px -4px rgba(31,35,41,0.02)
```
现有 tokens.css 阴影偏简单，建议补一层「弹窗阴影」。

### 1.6 语义变量体系（飞书 794 个 CSS 变量，命名规律）

飞书把 token 组织成**命名语义 + 色彩阶梯**两套，可直接映射：

**命名语义（直接可用）：**
- `--primary-pri-500`（主色）、`--text-*`（文字）、`--bg-*`（背景）
- `--function-danger-*` / `--function-success-*`（功能色）
- `--fill-*`（填充）、`--line-*`（边框）、`--icon-*`（图标）、`--shadow-*`（阴影）

**色彩阶梯（N 中性 + R/G/B/O/Y/C/P/I/L/S/W 十一色）：**
- N（中性）：N00 白 → N350 分隔线 → N500 占位 → N900 正文 → N1000 黑
- R（红）：R500 `#f54a45` / R600 `#d83931`（危险）
- G（绿）：G200 / G700 `#237b19`（成功）
- B（蓝）：B100 `#e1eaff` / B400 `#4e83fd` / B600 `#245bdb`
- O（橙）/ Y（黄）/ C（品红）/ P（紫）/ I（靛）/ L（黄绿）/ S / W

➡️ 这些阶梯已经够现有 `tokens.css` 的 Status 段对齐，建议把 status 色按飞书值校准（见 1.1 危险/成功色）。

---

## 二、组件清单（高组件化拆分）

> 遵循项目 CLAUDE.md「前端组件化原则」：一个组件一件事、共享放 `src/components/`、页面只组装、通信用 `v-model`。

### 2.1 基础组件（跨页面复用，对齐 Element Plus / 现有组件）

| 组件 | 飞书界面表现 | 对应 | 状态 |
|---|---|---|---|
| 按钮 Button | primary/默认/文字按钮，圆角 6px | `el-button`（主题调色） | 已有 |
| 图标 Icon | iconfont SVG symbol（275 path / 84 symbol / 23 svg） | `el-icon` + iconfont | 已有 |
| 表格 Table | 斑马纹 + hover 行 + 固定操作列 | `el-table`（五件套规范） | 已有 |
| 弹窗 Dialog | 圆角 32px、标题 18px/600、底部提交/取消 | `el-dialog`（需调圆角/间距） | 需调样式 |
| 下拉菜单 Dropdown | 触发按钮 → menuitem（新建评估题/子评估题） | `el-dropdown` | 已有 |
| 筛选 Filter | 下拉筛选面板 | `el-dropdown` + 表单 | 需建 |
| 分页 Pagination | 页码「1」 | `el-pagination` | 已有 |
| 用户卡片 UserCard | `ee-user-card`（飞书 web component，头像+姓名） | 需自建 `PerformanceUserCard` | 需建 |
| 表单输入 Input/Textarea | 计数 textarea、下拉、单选 | `el-input` / `el-select` / `PerformanceCountedTextarea` | 已有 |

### 2.2 业务组件（评估题页，需拆分开发）

页面文件只组装，下面每项抽成一个 `.vue`：

| 组件 | 职责 | 状态/证据 |
|---|---|---|
| `ReviewQuestionTable.vue` | 评估题列表（列：题目/类型/执行人/分值…）+ 行 hover 操作 | 表格 td/tr/th + hover 状态 |
| `ReviewQuestionCreateEntry.vue` | 「新建」按钮 + 下拉（新建评估题 / 新建子评估题） | menuitem 状态 |
| `ReviewQuestionTypePicker.vue` | 题目类型选择（6 种类型） | 6 种编辑弹窗 |
| `ReviewQuestionEditModal.vue` | 编辑弹窗外壳（标题栏 + 内容区 + 提交/取消） | 编辑 click 状态 ×6 |
| `ReviewQuestionFilterPanel.vue` | 筛选面板 | 筛选 click 状态 |
| `ReviewQuestionPreviewModal.vue` | 预览弹窗 | 预览 click 状态 |
| `ReviewQuestionSubmitBar.vue` | 弹窗底部提交/取消操作栏 | 提交/取消 click 状态 |

### 2.3 六种题目类型（编辑弹窗内容区，按类型拆子组件）

采集到的 6 种题目类型，编辑弹窗字段结构不同（可见元素 489 vs 417），每种是独立表单：

| 题目类型 | 关键字段（从弹窗文本） |
|---|---|
| 指标 | 指标类型、OKR 指标、加分项、7 级绩效等级 |
| 指标综合评分 | 指标综合评分配置 |
| 综合评价 | 综合评价 + 启用等级 |
| 评价值 | 评价值配置 |
| 投票项 | 投票项配置 |
| 评价值项 | 评价值项配置 |

➡️ 建议：`ReviewQuestionEditModal.vue` 只做外壳（标题 + 提交/取消），内容区按 `v-model` 分发给 6 个类型子组件（`ReviewQuestionFormIndicator.vue` 等），符合「一个组件一件事」。

---

## 三、对齐结论（tokens.css 需要改/补的清单）

**建议修改（对齐飞书真实值）：**
1. `--color-primary-hover: #2855cc` → `#1456f0`
2. `--color-primary-active: #1f4fb8` → `#245bdb`
3. `--color-text-primary: #1a2233` → `#1f2329`
4. `--color-text-placeholder: #9aa5b4` → `#8f959e`
5. `--color-border: #e4e9f0` → `#bbbfc4`
6. `--color-danger: #f04438` → `#d83931`

**建议新增：**
- `--color-link: #1890ff`
- `--spacing-25: 10px`
- `--radius-2xl: 32px`
- `--shadow-dialog`（飞书弹窗多层阴影）

**保持不变（已一致）：**
- 主色 `#3370ff`、页面背景、间距主体、圆角 6px/999px、字号 14px 正文。

---

## 四、证据来源

- 设计 token 频率：`static_design_evidence.json` → `tokens`（colors/typography/spacing/radii/shadows）
- 语义变量：`static_design_evidence.json` → `rules.css_variables`（794 个）
- 组件结构：`static_design_evidence.json` → `elements`（817 元素 tag/role 分布）
- 交互状态：`metadata.json` → `interaction_states`（30 个，11 hover + 19 click，含 6 种编辑弹窗）
- 采集会话：`idreamsky.feishu.cn_20260824_182446`
