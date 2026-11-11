# HRBP不可见范围 · 现有组件对比与全局 Token 治理方案

> 续 REA 抓包分析报告：`REA-HRBP不可见范围-编辑弹窗-抓包分析报告.md`
> 本报告目标：① 现有组件与 REA 规格逐项对比 → 复用哪些、修哪些；② 设计 token 提炼为全局层、与现有不一致处全局修正
> 对比基准代码：`hr-portal/frontend/src/components/performance/*` + `styles/tokens.css`
> 本轮只做分析，不改代码

---

## 1. 现有代码资产盘点（与本次还原相关）

### 1.1 已有页面与组件

| 资产 | 路径 | 现状 |
|---|---|---|
| 其他权限设置页 | `views/performance/OtherPermissionSettings.vue` | **已存在**，含「HRBP不可见范围」卡片（通用规则开关 + 特定范围 + 编辑） |
| HRBP 权限弹窗 | `components/performance/PerformanceHrbpPermissionDialog.vue` | **已存在**，但业务形态与 REA「设置范围」弹窗不同（HRBP+范围+不可见人员，非条件组） |
| 弹窗壳 | `PerformanceDialogShell.vue` | 已有，600px 默认宽，header/body/footer 结构完整 |
| 下拉壳 | `PerformanceSelectShell.vue` | 已有，含 tag 多选/overflow/搜索框/定位 |
| 普通选择 | `PerformanceSearchSelect.vue` | 已有，扁平选项列表 + checkmark |
| 员工选择 | `PerformancePersonSelect.vue` | 已有，**薄封装** PerformanceSearchSelect |
| 部门选择 | `PerformanceOrganizationSelect.vue` → `PerformanceOrganizationTreeSelect.vue` | 已有，树形（节点渲染在 `PerformanceOrganizationTreeNodes.vue`） |
| 按钮/开关 | `UiButton` / `UiSwitch` / `PerformancePermissionButton` | 已有 |
| API | `api/performance.ts` `performanceOtherPermissionSettingsApi` | 已有 GET/PATCH `/performance/permission-settings/other` |

### 1.2 关键差异定性

现有页面**业务模型是「HRBP × 权限范围 × 不可见人员」**，REA 真实页面模型是「**条件组编辑器（EmployeeScopeEditor）**」——REA 的「设置范围」弹窗是一套**通用的范围规则编辑**（员工/部门/直属上级条件 + 且/或逻辑），与现有 HRBP 授权模型完全不同维度。

> 结论：这不是「修一个组件」，而是 REA 弹窗需要**新增 EmployeeScopeEditor 组件族**；现有组件中可复用的是**基础设施**（DialogShell/SelectShell/Button/Tag），需新增的是**条件组编辑器**与其专用选择器。

---

## 2. 现有组件 vs REA 规格 · 逐项对比

### 2.1 弹窗壳 PerformanceDialogShell vs REA ud__dialog

| 维度 | REA 实测 | 现有 DialogShell | 差异 | 处置 |
|---|---|---|---|---|
| 宽度 | 840（`content-md`） | 默认 600，可传 width | 需传 `width="840px"` | 复用，传参 |
| 遮罩 | 半透明黑 | `--performance-overlay: rgba(0,0,0,.45)` | 接近（REA 目测 .4-.5） | 复用 |
| 标题 | 16/24/600 `#1F2329` | `font-size: var(--font-size-lg)`=16, 600 | 一致 | 复用 |
| 副标题 | 14/22 400 `#646A73`，位于标题下 | 有 description slot（`__description` 14/22 secondary） | 一致 | 复用 |
| 关闭按钮 | 28×28.8，20px 图标，hover 变背景 | 28px（`--performance-dialog-close-size`），20px svg，hover `rgba(31,35,41,.2)` | 一致 | 复用 |
| header 高 | 96（标题 48 + padding） | `--performance-dialog-header-min-height: 96px` | 一致 | 复用 |
| body 左右 padding | 24 | `--performance-dialog-padding: 24px` | 一致 | 复用 |
| footer | 56 高，按钮 80×32 | `--performance-dialog-footer-height: 56`，按钮 80×32 | 一致 | 复用 |
| 圆角 | 8 | `--performance-dialog-radius: var(--radius-lg)`=8 | 一致 | 复用 |
| 阴影 | 三层柔和阴影 | `--performance-dialog-shadow` 三层 | 一致 | 复用 |

**结论：弹窗壳完全可复用，无需修改。** 差异仅业务层（见 §4）。

### 2.2 选择器壳 PerformanceSelectShell vs REA ud__select

| 维度 | REA 实测 | 现有 SelectShell | 差异 | 处置 |
|---|---|---|---|---|
| 高度 | 32 | `--performance-select-height: 32` | 一致 | 复用 |
| 边框 | 1px `#D0D3D4` | `--performance-field-border: var(--performance-control-border)` = `--color-line-control: #d0d3d6` | REA `#D0D3D4` vs 现有 `#D0D3D6` | **修 token**（见 §4.1） |
| radius | 4 | `--performance-control-radius: var(--radius-md)`=6 | REA select radius 4，现有 6 | **修 token**（新增 select radius） |
| 已选 tag 底 | `#F0F4FF`（蓝） | `--performance-select-tag-background: rgba(31,35,41,.1)`（灰） | 差异大 | **修 token** |
| 已选 tag 字 | `#3370FF` | `--performance-select-tag-text: var(--color-text-primary)`=`#1F2329` | 差异大 | **修 token** |
| tag 高 | 24 | `--performance-select-tag-height: 24` | 一致 | 复用 |
| 清空按钮 | 12×28，hover 显示 | 12×28，hover 显示 | 一致 | 复用 |
| 箭头 | 12×28 `#646A73` | 12×28 `--performance-select-icon-color:#646A73` | 一致 | 复用 |
| 选项行高 | 30（cascader）/ 52（search 列表项） | `--performance-select-option-height: 32` | 见 §3.1 | 组件层区分 |
| 弹出面板 | 白底 shadow radius 8 | `--performance-popover-radius: var(--radius-lg)`=8 一致 | — | 复用 |

**结论：SelectShell 骨架复用，但 tag 配色需全局修正（灰底 → 蓝底），radius/边框微调。**

### 2.3 部门树 PerformanceOrganizationTreeSelect vs REA ud__treeSelect

| 维度 | REA 实测 | 现有树选择器 | 差异 | 处置 |
|---|---|---|---|---|
| 面板高 | 230 | popup-height 230 | 一致 | 复用 |
| 节点行高 | 30 | `--performance-select-option-height`=32 | 30 vs 32 | **修 token** |
| 缩进 | 16/级 | 8 + (level-1)*16 | 一致（16/级） | 复用 |
| 展开按钮 | 16×16（图标 10） | 24×24（图标 10） | 16 vs 24 | **修 token** |
| 节点结构 | 展开钮+标签+checker | 同 | — | 复用 |
| 选中态 | 蓝勾（checker 12×18.8） | 蓝勾 14px | 接近 | 复用 |
| 节点 hover | — | `rgba(31,35,41,.08)` | 待定 | 复用 |

**结论：树选择器结构复用，节点行高/展开钮尺寸需对齐。**

### 2.4 员工搜索（PersonSelect）vs REA 员工值选择器

| 维度 | REA 实测 | 现有 PersonSelect | 差异 | 处置 |
|---|---|---|---|---|
| 结果项 | 头像 32 圆 + 姓名 + 部门 + 高亮 | **无搜索结果面板**（仅扁平选项） | 缺头像/部门/高亮结构 | **需新增** |
| 搜索接口 | `POST /user/query` | 前端本地 filter（`filteredOptions`） | 不真实接入 | **需接接口** |
| 展开机制 | 输入关键词才出结果 | openOnFocus 即展开 | 机制不同 | 新增组件 |
| 多选 tag | 蓝底蓝字 | 灰底黑字 | 同 §2.2 | 全局修 |

**结论：现有 PersonSelect 是「本地过滤扁平列表」，无法复用为 REA 员工搜索器——需要新增 `PerformanceEmployeeSearchSelect`（或扩展现有壳）。**

---

## 3. 需新增的组件族（REA EmployeeScopeEditor）

现有组件体系**没有**条件组编辑器，需新增：

| 新组件 | 职责 | 复用基础 |
|---|---|---|
| `PerformanceScopeConditionEditor.vue` | 条件组容器（组标题/条件行/且/或/添加条件/添加人员范围） | SelectShell |
| `PerformanceScopeConditionFieldSelect.vue` | 字段级联（直属上级/员工/部门，scene 裁剪） | SelectShell + cascader 样式 |
| `PerformanceScopeOperatorSelect.vue` | 操作符（eq/neq） | SelectShell |
| `PerformanceEmployeeSearchSelect.vue` | 员工值选择（搜索接口 + 头像/部门/高亮） | SelectShell |
| `PerformanceDepartmentTreeSelect.vue` | 部门值选择（树 + 多选） | OrganizationTreeSelect |

> 上述组件同时反哺「被评估人信息可见性设置」「可催办环节类型」等后续 REA 还原，属全局复用层。

---

## 4. 全局 Token 提炼与修正（tokens.css）

### 4.1 需修正的现有 token（与 REA 不一致）

| 现 token | 现值 | REA 实测 | 修正为 | 影响面 |
|---|---|---|---|---|
| `--color-line-control` | `#d0d3d6` | `#D0D3D4` | `#d0d3d4` | 全站 select/input 边框 |
| `--performance-select-tag-background` | `rgba(31,35,41,.1)` 灰 | `#F0F4FF` | `#f0f4ff` | 全站多选 tag |
| `--performance-select-tag-text` | `#1F2329` | `#3370FF` | `#3370ff` | 全站多选 tag |
| `--performance-select-option-height` | 32 | 树节点 30 / cascader 30 | 新增 `--performance-tree-node-height: 30px` | 树/级联专用 |
| 展开按钮 | 24×24 | 16×16 | 新增 `--performance-tree-expand-size: 16px` | 树选择器 |

### 4.2 需新增的全局 token（REA 实测但现有缺失）

```css
/* HRBP 范围规则（EmployeeScopeEditor）——REA /perf/admin/selection 实测 */
--performance-scope-group-title-height: 22px;        /* 组标题行高 */
--performance-scope-row-height: 32px;                /* 条件行高 */
--performance-scope-field-width: 128px;              /* 字段选择器宽 */
--performance-scope-operator-width: 88px;            /* 操作符宽 */
--performance-scope-value-width: 476px;              /* 值选择器宽（自适应剩余基准） */
--performance-scope-logic-width: 27px;               /* 组内「且」逻辑列 */
--performance-scope-group-gap: 22px;                 /* 组间「或」分隔高 */
--performance-scope-field-list-width: 162px;         /* 字段级联下拉宽 */
--performance-scope-field-option-height: 30px;       /* 级联选项高 */
--performance-scope-search-item-height: 52px;        /* 员工搜索结果项高 */
--performance-scope-search-avatar-size: 32px;        /* 搜索项头像 */
--performance-scope-search-name-height: 22px;        /* 姓名行 */
--performance-scope-search-dept-height: 22px;        /* 部门行 */
--performance-scope-highlight-color: #1456f0;        /* 关键词高亮 */
--performance-scope-dept-text-color: #8f959e;        /* 部门行弱文本 */
--performance-scope-delete-size: 24px;               /* 条件组删除按钮 */
--performance-scope-add-btn-gap: 16px;               /* 添加按钮间距 */
/* 部门树补充 */
--performance-tree-node-height: 30px;
--performance-tree-expand-size: 16px;
--performance-tree-expand-icon-size: 10px;
--performance-tree-indent: 16px;
```

### 4.3 修正风险评估

| 风险 | 说明 | 缓解 |
|---|---|---|
| `--color-line-control` 全局改色 | 影响所有 input/select/button 边框（`#d0d3d6`→`#d0d3d4`） | 两色视觉几乎一致，回归面小；但仍需跑一次全站视觉回归 |
| tag 灰→蓝 | 影响所有多选 tag 外观（模板配置、人员选择等） | 符合 REA 真实色板，属**正向修正**；需检查使用 tag 的既有页面截图对照 |
| 新增 token 均为增量 | 不改现有值，零回归 | 直接追加 `:root` 段 |

---

## 5. 接口接入（真实接入，本轮先定格契约）

### 5.1 现有 API vs REA 接口

| 现有前端 | 现有后端路径 | REA 真实接口 | 差异 |
|---|---|---|---|
| GET/PATCH `/performance/permission-settings/other` | 自研 FastAPI | `GET /perf/api/user/hrbp/blacklist?tenantId=` | **完全不同的系统**（REA 是飞书原生绩效，现有是自研 HR Portal） |

> **关键结论**：现有系统是自研 hr-portal（FastAPI 后端），REA 是飞书原生绩效系统。像素级还原是指**视觉/交互/组件**对齐 REA；接口需按 REA 语义映射到自研后端，不能直接调飞书接口。映射建议：

| REA 语义 | 建议自研 API 契约（沿用现有 `/performance/permission-settings/other` 扩展或新端点） |
|---|---|
| 读取范围 | `hrbp_invisible_scopes: [{ groups: [{ conditions: [{ field: "employee"/"department"/"directLeader", operator: "eq"/"neq", value: [] }] }] }]` |
| 字段元数据 | `GET .../scope-meta?scene=hrbp_blacklist` → `[{key, operators}]` |
| 部门树 | 复用现有 organization_tree（自研） |
| 员工搜索 | 复用现有 people search（自研）或新增 `/performance/people/search?keyword=` |

### 5.2 权限

- REA 页面无独立权限码，沿登录态；自研侧复用既有「其他权限设置」路由守卫 + `performance.configuration.manage`（与 PM-T007 一致）
- 前端编辑入口沿用 `PerformancePermissionButton` op="U" 的既有约定

---

## 6. 实施建议（后续开发时按此顺序，本轮不动代码）

| 步骤 | 内容 | 依据 |
|---|---|---|
| S1 | tokens.css 追加 §4.2 新 token + 修正 §4.1 四处值 | 全局零/低回归 |
| S2 | 新增 `PerformanceScopeConditionEditor` 组件族（§3） | REA 报告 §3 |
| S3 | 新增员工搜索选择器（接搜索接口、头像/部门/高亮渲染） | REA 报告 §4.3/§5.2 |
| S4 | OtherPermissionSettings.vue 的「特定范围」编辑入口改挂新弹窗（替换现有 HrbpPermissionDialog 业务模型） | REA 报告 §2 |
| S5 | API 层按 §5.1 扩展自研契约 | — |
| S6 | 用 REA 抓包 1x 基线逐值校验（复用 compare 脚本模式） | REA 报告 §7 |

---

## 7. 附件：本轮对比证据索引

| 证据 | 路径 |
|---|---|
| REA 弹窗 DOM 全量 | `rea-extract/out/hrbp-invisible/04-dialog-content/dialog-content.json` |
| 条件组交互树 | `.../06-interactions-v2/after-add-both.json` |
| 员工搜索面板 | `.../11-search-panel/search-panel.json` |
| 部门树面板 | `.../13-dept-save2/dept-panel.json` |
| 接口响应 | `.../14-api-direct/perf_api_user_hrbp_blacklist_*.json` |
| 现有代码基准 | `hr-portal/frontend/src/components/performance/` + `styles/tokens.css` |
