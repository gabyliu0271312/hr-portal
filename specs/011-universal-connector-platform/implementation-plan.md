# UCP 通用数据连接器平台实施拆解 Spec

> **文档标注**：本文档为 `011-universal-connector-platform` 的实施拆解补充文档，用于承接主规格 `spec.md`、UI 蓝图 `outputs/ucp-blueprint/index.html` 和现有 UCP 代码。  
> **本版重要定调**：当前 UCP 仍处于开发期，不做旧模型兼容，不保留“连接器优先”的产品路径；后续按蓝图终态彻底统一为 `系统 → 资源 → 凭证 → 流水线画布`。

版本：v2.1  
日期：2026-07-03  
状态：实施基准稿（已补充应用化预留、一级导航和独立权限命名空间）  
适用范围：HR Portal 数据接入、数据同步、数据分发、流水线配置、执行审计、事件触发、监控与死信

关联文档：

- 主规格：`specs/011-universal-connector-platform/spec.md`
- UI 蓝图：`outputs/ucp-blueprint/index.html`
- 真实前端：`hr-portal/frontend/src/views/datasource/ucp/`
- 前端 API：`hr-portal/frontend/src/api/ucp.ts`
- 后端 UCP：`hr-portal/backend/app/ucp/`

---

## 1. 重新评估结论

### 1.1 需求是否合理

结论：**合理，但必须按 HR Portal 数据底座定位建设，不做泛企业 iPaaS。**

UCP 对 HR Portal 的合理价值：

| HR Portal 当前问题 | UCP 目标价值 |
| --- | --- |
| 北森、飞书、OA、外部账号等对接分散 | 统一接入系统、资源、凭证和执行入口 |
| 每个新系统偏定制开发 | 通过资源 + 适配器沉淀可复用能力 |
| 同步任务缺少链路追踪 | 用 Pipeline Run、Step Run、Trace ID 统一追踪 |
| 凭证管理分散且风险高 | 系统内凭证、多环境、主备、过期、加密、审计 |
| HR 敏感数据同步风险高 | 权限、脱敏、执行主体、数据范围快照 |
| 跨系统流程难配置 | 通过流水线画布配置系统资源之间的数据流 |

### 1.2 关键调整

本实施版相对之前的评估有 5 个变化：

1. **不做兼容**：当前仍是开发期，允许彻底调整概念、API、表结构、页面命名，避免长期背负 Connector 旧模型。
2. **蓝图终态写入规格**：蓝图 15 个场景作为最终产品状态进入规格，不只是参考图。
3. **画布前置**：流水线画布是配置入口，不放到后期；第一阶段即建设最小可用画布。
4. **UI 设计写入规格**：蓝图作为交互、信息架构和页面内容基准；视觉风格需以前端专家视角评估后与 HR Portal 现有 Element Plus 企业后台风格融合，不做深色科技风 1:1 照搬。
5. **任务可勾选**：所有开发任务拆为可标记状态的最小项，每项包含验收标准。
6. **应用化预留**：UCP 当前仍在 HR Portal 内交付，但从导航、路由、权限命名和模块边界上按未来可独立应用预留。

---

## 2. 产品最终状态

### 2.1 HR Portal 中的定位

UCP 是 HR Portal 的**数据接入与流程编排底座**，不是独立的通用 iPaaS。

边界：

| 范围 | 是否属于 UCP | 说明 |
| --- | --- | --- |
| HR 相关外部系统数据接入 | 是 | 北森、飞书、OA、滴滴、曹操、Salesforce 等 |
| HR Portal 内部数据分发 | 是 | 写入业务表、推送报表、通知 |
| 流水线配置与执行 | 是 | 拉取、循环、转换、通知、审批 |
| 凭证加密和过期管理 | 是 | 作为系统配件管理 |
| 通用任意 API 零代码平台 | 远期 | Phase 5 评估建设；当前不承诺任意系统零代码接入 |
| 企业级 ESB/iPaaS | 远期 | Phase 6 评估建设；当前不承担全公司所有集成治理 |
| 外部系统主数据治理 | 远期 | Phase 7 评估建设；当前只管理接入配置和同步结果 |

### 2.2 应用化预留定位

结论：**应用化设计，门户内交付。**

UCP 当前仍作为 HR Portal 的内部一级能力交付，不立即拆成独立部署应用；但根据 Phase 5-7 的远期规划，它已经具备发展为独立数据连接 / 集成治理应用的可能性，因此从 Phase 1 开始预留以下边界：

| 维度 | 当前交付 | 预留目标 |
| --- | --- | --- |
| 产品形态 | HR Portal 内的一级业务能力 | 未来可独立为“数据连接平台”应用 |
| 导航位置 | 顶部一级 Tab：`数据连接` | 独立应用首页 / 独立应用壳 |
| 路由前缀 | `/ucp/...` | 可平滑迁移到独立域名或子应用 |
| 权限体系 | 复用 HR Portal Menu / Role / RoleMenu / UserRole | 权限 code 使用 `ucp.*` 独立命名空间 |
| 视觉风格 | 融合 HR Portal Element Plus 浅色后台 | 保持 design token，可替换应用壳 |
| 数据边界 | HR 相关数据接入和同步 | 可扩展到跨业务域集成治理 |

设计原则：

1. **不做独立部署过度设计**：Phase 1 不引入微前端、独立认证中心或独立数据库。
2. **不绑定系统设置心智**：UCP 不再放在“系统设置 → 数据接入”下面。
3. **不使用 datasource 命名锁死边界**：UCP 权限、路由、菜单从 Phase 1 起使用独立命名空间。
4. **权限实现复用现有体系**：仍然用当前 HR Portal 的菜单权限、角色权限和后端 `require_op`，只调整资源 code。
5. **模型预留业务域隔离**：系统、资源、流水线、凭证等核心对象预留 owner、team/domain、env、sensitivity 等字段或扩展点。

### 2.3 顶部导航与路由目标

UCP 应升级为 HR Portal 顶部一级 Tab，而不是系统设置下的子功能。

推荐顶部导航：

```text
HR Portal
├─ 首页
├─ 报表管理
├─ 提效工具
├─ 数据连接       ← UCP 一级入口
├─ 绩效管理
└─ 系统设置
```

`数据连接` 内部左侧菜单：

```text
数据连接
├─ 接入系统
├─ 流水线
├─ 执行日志
├─ 事件中心
├─ 监控中心
├─ 死信队列
├─ 审批中心
├─ 集成资产      远期 Phase 6
└─ 主数据治理    远期 Phase 7
```

目标路由前缀：

| 旧路由 | 新路由 |
| --- | --- |
| `/datasource/ucp` | `/ucp` |
| `/datasource/ucp/config` | `/ucp/pipelines` 或 `/ucp/templates` |
| `/datasource/ucp/pipeline-designer` | `/ucp/pipeline-designer` |
| `/datasource/ucp/executions` | `/ucp/executions` |
| `/datasource/ucp/events` | `/ucp/events` |
| `/datasource/ucp/event-triggers` | `/ucp/triggers` |
| `/datasource/ucp/dead-letters` | `/ucp/dead-letters` |
| `/datasource/ucp/monitor` | `/ucp/monitor` |
| `/datasource/ucp/approvals` | `/ucp/approvals` |
| `/datasource/ucp/external-accounts` | `/ucp/external-accounts` |
| `/datasource/ucp/oa-sync` | `/ucp/oa-sync` |

### 2.4 权限命名空间目标

UCP 继续接入 HR Portal 当前权限体系，但权限资源 code 改为独立 `ucp.*` 命名空间，避免未来独立应用化时仍绑定 `datasource`。

推荐权限 code：

| 权限 code | 说明 | 操作位 |
| --- | --- | --- |
| `ucp.app` | 数据连接顶部一级入口 | V |
| `ucp.systems` | 接入系统 | V/C/U/D |
| `ucp.resources` | 系统资源 | V/C/U/D |
| `ucp.credentials` | 凭证 | V/C/U/D |
| `ucp.pipelines` | 流水线 | V/C/U/D/E |
| `ucp.pipeline_designer` | 流水线画布 | V/C/U |
| `ucp.executions` | 执行日志与手动执行 | V/C/E |
| `ucp.events` | 事件中心 | V/C/U/D |
| `ucp.triggers` | 触发器 | V/C/U/D |
| `ucp.dead_letters` | 死信队列 | V/U/D |
| `ucp.monitor` | 监控中心 | V/E |
| `ucp.approvals` | 审批中心 | V/C/U |
| `ucp.external_accounts` | 外部账号 | V/C/U/D |
| `ucp.oa_sync` | OA 同步 | V/C/U/E |
| `ucp.assets` | 集成资产目录，远期 | V/E |
| `ucp.governance` | 主数据治理，远期 | V/C/U/D/E |
| `ucp.admin` | UCP 管理配置 | V/C/U/D |

旧权限映射建议：

| 旧 code | 新 code |
| --- | --- |
| `datasource.ucp_config` | `ucp.systems` / `ucp.resources` / `ucp.credentials` / `ucp.pipelines` / `ucp.admin` |
| `datasource.ucp_executions` | `ucp.executions` |
| `datasource.ucp_events` | `ucp.events` / `ucp.triggers` / `ucp.dead_letters` |
| `datasource.ucp_external_accounts` | `ucp.external_accounts` / `ucp.approvals` / `ucp.oa_sync` |

权限设计要求：

- 前端路由 `meta.menuCode` 使用 `ucp.*`。
- 后端 `require_op` 使用 `ucp.*`。
- 菜单 seed 写入 `ucp` 顶部节点，不再把 UCP 叶子挂在 `system.datasource` 下。
- 角色配置页仍可通过现有 Menu / RoleMenu 管理 UCP 权限。
- 超级管理员继续自动获得全部 UCP 权限。
- 后续独立应用化时，可以把 `ucp.*` 权限资源整体迁移到独立权限服务。

### 2.5 最终信息架构

真实产品最终应与蓝图一致：

```text
数据接入
├─ 接入系统
│  ├─ 系统首页：KPI + 系统卡片
│  ├─ 新建系统：4 步向导
│  ├─ 系统详情：6 Tab 抽屉
│  ├─ 系统资源：表 / API / 报表 / 文件 / Webhook
│  └─ 系统凭证：prod / staging / dev，多环境、主备
├─ 流水线
│  ├─ 流水线列表
│  ├─ 新建流水线
│  ├─ 新建模板
│  ├─ 画布设计模板
│  ├─ 执行日志
│  └─ 执行详情
├─ 事件中心
│  ├─ 事件列表
│  ├─ 事件详情
│  └─ 触发器配置
├─ 监控中心
├─ 死信队列
└─ 审批中心
```

### 2.6 统一领域模型

最终只保留以下前台概念：

```text
System 接入系统
  ├─ Resource 资源
  │  ├─ TABLE 表
  │  ├─ API 接口
  │  ├─ REPORT 报表
  │  ├─ FILE 文件模板
  │  └─ WEBHOOK 事件入口
  └─ Credential 凭证
      ├─ prod
      ├─ staging
      └─ dev

Pipeline 流水线
  ├─ Template 画布模板
  ├─ Node 画布节点
  ├─ Edge 画布连线
  ├─ Run 执行实例
  └─ StepRun 步骤实例
```

### 2.7 关于 Connector 的彻底调整

当前开发期不做兼容，因此后续应执行：

- 产品文案不再使用“连接器”作为一级对象。
- 前端页面不再有 `ConnectorListView` 作为用户主入口。
- API 主路径不再以 `/connectors` 为核心。
- 数据模型以 `system/resource/credential/pipeline/template/event` 为核心。
- Adapter 作为技术层保留，用于描述 REST、SOAP、JDBC、Feishu、Beisen 等协议/动作适配。
- 已有 `connector_*` 命名代码允许在开发中重构或改名，不要求兼容旧字段。

推荐目标命名：

| 旧命名 | 新命名 |
| --- | --- |
| ConnectorSystemConfig | UcpResource 或 UcpResourceAction |
| connector_code | resource_code 或 action_code |
| connector_type | resource_type / action_type |
| ConnectorListView | ResourceListView 或并入 SystemDetailDrawer |
| CredentialListView 一级入口 | SystemDetailDrawer 内的 Credential Tab |
| Pipeline connector node | Pipeline resource node |

---

## 3. 蓝图交互参考与 HR Portal 风格融合规范

`outputs/ucp-blueprint/index.html` 是 UCP 最终交互、信息架构、页面内容层级和关键组件形态的参考基准；但它不是要求真实产品逐像素复刻的视觉稿。真实 Vue 页面必须在保留蓝图交互意图的基础上，融合 HR Portal 现有整体设计语言。

### 3.1 前端专家评估结论

结论：**交互结构按蓝图，视觉风格按 HR Portal。**

评估依据：

- HR Portal 当前整体是浅色企业后台风格，基于 Element Plus、卡片、表格、抽屉、统一设计 token。
- 现有全局样式已定义 `--color-primary`、`--color-bg-page`、`--color-bg-card`、`--color-text-*`、`--color-border`、`--radius-*`、`--shadow-*` 等变量。
- 现有页面普遍采用 `24px` 页面边距、`el-card`、`el-table`、`el-drawer`、`el-button`、`el-tag` 的轻量企业管理台体验。
- 蓝图的深色科技风、独立侧边栏/顶栏如果 1:1 搬入真实系统，会与 HR Portal 全局导航、视觉 token 和用户心智不一致。

因此真实实现策略为：

```text
蓝图负责：页面结构、业务信息层级、交互路径、卡片内容、凭证 chip、画布模式
HR Portal 负责：颜色、字体、间距、圆角、阴影、Element Plus 组件规范、全局导航一致性
```

### 3.2 蓝图内容采用策略

| 蓝图元素 | 采用方式 | 说明 |
| --- | --- | --- |
| 信息架构 | 完全采用 | 数据接入 → 接入系统 / 流水线 / 事件 / 监控 / 死信等结构保留 |
| 场景 2 首页布局 | 结构采用，视觉融合 | 标题、KPI、筛选、系统卡片、添加卡片保留；样式用 HR Portal 浅色卡片 |
| 系统卡片信息层级 | 完全采用 | 图标、名称、编码协议、状态、凭证 chip、资源数、流水线数、同步次数保留 |
| 凭证 chip | 完全采用，样式融合 | prod/staging/dev、主备、过期状态按蓝图；用 `el-tag`/轻量 chip 实现 |
| 新建系统 4 步向导 | 完全采用 | 使用 Element Plus Steps/Form/Drawer/Dialog 组合实现 |
| 系统详情 6 Tab 抽屉 | 完全采用 | 使用 HR Portal 现有 `el-drawer` 风格，不复制蓝图深色抽屉 |
| 流水线画布三栏结构 | 完全采用 | 左节点面板、中画布、右属性面板、顶部操作区必须保留 |
| 蓝图深色科技风 | 不 1:1 采用 | 仅吸收高密度、状态色、层级清晰的表达方式 |
| 蓝图独立左侧菜单/顶栏 | 融合采用 | 若 HR Portal 已有全局导航，不在 UCP 内重复造一套外壳 |
| 监控图表视觉 | 融合采用 | 图表结构参考蓝图，颜色和卡片容器用 HR Portal token |

### 3.3 真实 UI 设计原则

| 原则 | 要求 |
| --- | --- |
| 全局一致 | UCP 页面必须看起来属于 HR Portal，而不是嵌入了另一个独立系统 |
| 交互一致 | 用户路径、信息层级、状态表达必须与蓝图一致 |
| 组件优先 | 优先使用 Element Plus 和项目现有封装，不为蓝图效果重复造基础组件 |
| Token 优先 | 颜色、字体、间距、圆角、阴影优先使用全局 CSS 变量 |
| 高密度但不拥挤 | 吸收蓝图高信息密度，但保证 1366px 笔记本可读、可操作 |
| 可访问性 | 状态不能只靠颜色区分，需配合文本、图标或 tooltip |
| 数据真实 | KPI、卡片、凭证、流水线、执行状态必须来自 API，不用静态假数据冒充真实效果 |

### 3.4 场景 2 首页 UI 规格

页面结构必须包含：

- 标题：`接入系统`
- 副标题：`业务系统 → 资源（表/API）→ 凭证（多环境/主备）`
- 右上操作：`导入模板`、`添加系统`
- 6 个 KPI：
  - 接入系统
  - 数据资源
  - 凭证总数
  - 活跃流水线
  - 24h 同步次数
  - 失败率
- 筛选栏：
  - 全部
  - 运行中
  - 已停用
  - 异常
  - 类别
  - 排序：最近活跃
- 系统卡片网格：
  - 系统图标
  - 系统名称
  - 系统编码 + 协议
  - 状态
  - 凭证 chip
  - 资源数
  - 流水线数
  - 24h 同步次数
- 虚线添加卡片：`添加系统`

视觉实现要求：

- 使用 HR Portal 浅色背景和卡片，不强制使用蓝图深色背景。
- 图标尺寸需适配笔记本屏幕，优先控制在 36-44px 区间，不因装饰图标挤占核心信息。
- KPI 卡片、筛选栏、系统卡片在 1366px 宽度下不得横向溢出。

系统卡片凭证 chip 样式：

```text
● prod
○ staging
○ dev
+ 补充
```

已过期样式：

```text
凭证（1 套 · 已过期）
● prod (过期)
+ 补充
```

### 3.5 场景 3 新建系统 UI 规格

必须是 4 步向导：

1. 系统信息
2. 凭证录入
3. 资源配置
4. 检查测试

每一步必须可返回修改，最后一步展示检查结果和测试结果。视觉使用 HR Portal 表单、步骤条、按钮和提示样式。

### 3.6 场景 4 系统详情 UI 规格

必须采用抽屉形态，包含 6 个 Tab：

1. 概览
2. 资源
3. 凭证
4. 流水线
5. 执行记录
6. 审计/测试

凭证必须内嵌在系统详情中，不作为普通用户主流程的独立一级页面。

### 3.7 场景 8 流水线画布 UI 规格

画布是第一阶段核心配置方式。

必须包含：

- 左侧节点面板
- 中间画布区域
- 右侧属性配置面板
- 顶部保存、试运行、发布操作区
- 节点连线
- 节点状态/校验提示

第一阶段节点类型：

```text
RESOURCE        资源调用节点，绑定 system_id + resource_id + credential_id
LOOP_RESOURCE   循环资源调用节点
TRANSFORM       转换节点
NOTIFY          通知节点
```

第二阶段节点类型：

```text
BRANCH          条件分支
WAIT            等待节点
APPROVAL        审批节点
```

### 3.8 UI 验收标准

| 验收项 | 标准 |
| --- | --- |
| 交互还原 | 蓝图中的关键页面结构、入口、层级和操作路径在真实页面中可找到 |
| 风格一致 | 页面使用 HR Portal 现有浅色企业后台风格，不出现割裂的深色独立系统外壳 |
| 组件一致 | 优先使用 Element Plus 和项目已有样式覆盖，按钮、表格、抽屉、标签风格一致 |
| 设计 token | 颜色、边框、圆角、阴影、字体尽量来自全局 token，不散落硬编码 |
| 响应式 | 1366px 笔记本屏幕无核心内容横向溢出，关键操作不被遮挡 |
| 数据真实 | UI 展示的 KPI、卡片统计、凭证状态、执行状态来自 API |
| 蓝图可访问 | `outputs/ucp-blueprint/index.html` 和 public copy 仍可打开，用作交互对照 |

---

## 4. 分期策略

虽然蓝图终态完整写入规格，但开发必须分期。

### Phase 1：骨架统一 + 画布最小闭环

目标：彻底统一系统/资源/凭证模型，同时完成 UCP 一级应用入口、`/ucp` 路由、`ucp.*` 权限命名空间、首页、系统详情、画布、流水线执行的最小闭环。

必须包含：

- 顶部一级 Tab：`数据连接`
- `/ucp` 路由前缀
- `ucp.*` 权限命名空间
- 首页场景 2
- 新建系统场景 3 的最小版
- 系统详情场景 4 的最小版
- 流水线列表场景 7
- 流水线画布场景 8 的最小可用版
- 执行日志场景 9
- 执行详情场景 10 的最小版
- Offer 同步或等价示例流水线跑通

### Phase 2：资源/凭证/执行运维增强

目标：补齐系统管理和执行运维体验。

包含：

- 凭证主备切换
- 资源详情反向引用
- 失败项重跑
- 通知模板
- 测试引擎
- 监控中心基础版

### Phase 3：事件驱动和死信

目标：按蓝图补齐事件中心、触发器、死信队列。

包含：

- 事件中心
- 事件详情
- 触发器配置
- 死信队列
- 事件重放
- 到期重试扫描

### Phase 4：高级自动化

目标：补齐审批、外部账号、OA 同步、复杂画布节点。

包含：

- 审批节点
- 外部账号创建/删除
- OA 组织同步
- 条件分支
- 等待节点
- 更完整监控大盘
### Phase 5：通用 API 配置化能力（远期）

目标：在 HR 场景稳定后，扩展为“已支持协议范围内”的通用 API 配置化接入能力。

包含：

- REST API 资源配置器
- 请求参数、Header、Body 模板
- 分页、限流、重试配置
- 响应提取和字段映射
- API 连接测试和样例预览
- API 模板市场/模板库

边界：Phase 5 仍不承诺任意系统零代码接入，只覆盖已支持认证、分页和响应结构的 API。

### Phase 6：集成治理 / iPaaS 能力雏形（远期）

目标：当 UCP 已稳定支撑 HR Portal 内部集成后，再评估扩展为跨域集成治理能力。

包含：

- 跨业务域系统目录
- 集成资产目录
- 统一流量、失败率、SLA 视图
- 跨系统依赖拓扑
- 集成变更审批
- 多租户/多团队隔离
- 更完整的告警规则和订阅

边界：Phase 6 是治理能力雏形，不等于立即承担全公司 ESB/iPaaS 替代。

### Phase 7：外部系统主数据治理协同（远期）

目标：在数据接入稳定后，扩展对外部系统主数据质量、映射和差异的协同治理能力。

包含：

- 外部系统主数据目录
- 外部 ID 与 HR Portal 主数据映射
- 跨系统差异检测
- 数据质量规则
- 冲突处理工作台
- 主数据变更影响分析
- 治理任务和整改闭环

边界：Phase 7 是协同治理，不直接替代外部系统自身主数据管理职责。

---

## 5. 可勾选开发任务清单

> 状态标记建议：`[ ] 未开始`、`[~] 开发中`、`[x] 已完成`、`[!] 阻塞`。  
> 每个任务必须完成对应验收标准后才能标记为 `[x]`。

---

## 5.1 Phase 1：骨架统一 + 画布最小闭环

### A. 文档与蓝图基线

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-A01 | 确认蓝图作为终态 UI 规格进入 spec | `spec.md`, `implementation-plan.md` | 文档中明确蓝图 15 场景是最终状态，不是临时参考 |
| [x] | P1-A02 | 确认蓝图仍可查看 | `outputs/ucp-blueprint/index.html`, `frontend/public/outputs/ucp-blueprint/index.html` | 浏览器可打开蓝图，真实 Vue 页面不依赖蓝图 HTML |
| [x] | P1-A03 | 删除或隐藏旧 012 文档引用 | `specs/011-universal-connector-platform/README.md` | 文档索引只指向 011 目录内文件 |

### B. 应用入口、路由与权限命名空间

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-B01 | 新增 UCP 顶部一级菜单 `数据连接` | `backend/app/seed.py`, 菜单表 | 登录后顶部可看到 `数据连接` Tab，UCP 不再作为系统设置下的普通子功能展示 |
| [x] | P1-B02 | 调整 UCP 左侧菜单结构 | `seed.py`, `Default.vue`, `menuRoutes.ts` | `数据连接` 下包含接入系统、流水线、执行日志、事件中心、监控中心、死信队列、审批中心等入口 |
| [x] | P1-B03 | 路由前缀迁移到 `/ucp` | `router/index.ts`, `menuRoutes.ts` | UCP 主入口为 `/ucp`，各页面使用 `/ucp/...`；页面刷新和直接访问正常 |
| [x] | P1-B04 | 移除 UCP 对系统设置导航层级的依赖 | `Default.vue`, seed 菜单 | 系统设置下不再出现 UCP 聚合入口，系统设置仅保留权限、参数、日志等后台配置 |
| [x] | P1-B05 | 建立 `ucp.*` 权限 code | `seed.py`, 权限表 | 菜单权限中存在 `ucp.app`、`ucp.systems`、`ucp.pipelines`、`ucp.executions` 等独立 code |
| [x] | P1-B06 | 前端路由权限改为 `ucp.*` | `router/index.ts` | UCP 页面 `meta.menuCode` 不再使用 `datasource.ucp_*` |
| [x] | P1-B07 | 后端接口权限改为 `ucp.*` | `backend/app/ucp/router.py` | UCP API 的 `require_op` 使用 `ucp.*`，不再使用 `datasource.ucp_*` |
| [x] | P1-B08 | 权限角色配置兼容当前体系 | `roles`/`menus` 相关页面与 API | 角色配置页可给用户分配 UCP 查看、创建、更新、删除、执行、导出权限 |
| [x] | P1-B09 | 超管权限自动覆盖 UCP | `seed.py` | 超级管理员自动拥有全部 `ucp.*` 权限 |
| [x] | P1-B10 | 预留独立应用化字段/边界 | UCP models/API DTO | System/Resource/Pipeline/Credential 至少预留 owner/team/domain/env/sensitivity 中必要字段或扩展配置 |
| [x] | P1-B11 | 删除旧 datasource UCP 菜单依赖 | `seed.py`, `menuRoutes.ts`, `Default.vue` | 新环境 seed 不再生成 `datasource.ucp_*` 作为主权限；开发期无需兼容旧 code |
| [x] | P1-B12 | 应用化入口验收 | 前后端整体 | 无权限用户看不到 `数据连接`；有权限用户可进入 `/ucp`；各子页面权限拦截正常 |

### C. 领域模型彻底统一

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-C01 | 梳理现有 connector 命名表/模型/接口 | `backend/app/ucp/models.py`, `router.py`, `ucp.ts` | 输出需要改名或废弃的清单 |
| [x] | P1-C02 | 定义最终 System 数据结构 | 后端模型/迁移/API 类型 | 系统包含 code、name、type、protocol_label、icon、owner、status、health_status |
| [x] | P1-C03 | 定义最终 Resource 数据结构 | 后端模型/迁移/API 类型 | 资源包含 system_id、resource_code、resource_name、resource_type、adapter_code、protocol、mapping_config、status |
| [x] | P1-C04 | 定义最终 Credential 数据结构 | 后端模型/迁移/API 类型 | 凭证包含 system_id、env_tag、is_primary、auth_type、expires_at、status，secret 加密存储 |
| [x] | P1-C05 | 定义最终 Pipeline Template 数据结构 | 后端模型/迁移/API 类型 | 模板包含 nodes、edges、version、status、created_by |
| [x] | P1-C06 | 定义最终 Pipeline Run / Step Run 数据结构 | 后端模型/迁移/API 类型 | 执行实例包含 trace_id、pipeline_id、status、duration、context_summary、step_runs |
| [x] | P1-C07 | 移除普通用户主路径中的 Connector 概念 | 前端页面、路由、菜单、文案 | 用户主流程只看到系统、资源、凭证、流水线 |

### D. API 重构

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-D01 | 设计系统 API | `router.py`, `system_service.py`, `ucp.ts` | 支持列表、详情、新建、更新、删除 |
| [x] | P1-D02 | 设计资源 API | `router.py`, `system_service.py`, `ucp.ts` | 支持按 system_id 查询资源 |
| [x] | P1-D03 | 设计凭证 API | `router.py`, `credential_service.py`, `ucp.ts` | 支持按 system_id 查询、新建、设为主用、停用 |
| [x] | P1-D04 | 设计首页 Dashboard API | `router.py`, `monitor_service.py`, `ucp.ts` | 返回 6 个 KPI 和系统卡片聚合数据 |
| [x] | P1-D05 | 设计流水线模板 API | `router.py`, `pipeline_template.py`, `ucp.ts` | 支持模板 CRUD、保存 nodes/edges、版本号 |
| [x] | P1-D06 | 设计流水线配置 API | `router.py`, `pipeline_engine.py`, `ucp.ts` | 支持从模板创建流水线、发布、停用 |
| [x] | P1-D07 | 设计试运行 API | `router.py`, `pipeline_engine.py`, `ucp.ts` | 支持画布试运行并返回 trace_id |
| [x] | P1-D08 | 设计执行记录 API | `router.py`, `pipeline_engine.py`, `ucp.ts` | 支持列表、详情、按 pipeline/status/time 过滤 |

### E. 首页场景 2

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-E01 | 按蓝图重构首页布局 | `SystemsTabView.vue` | 标题、副标题、操作按钮、KPI、筛选栏、卡片网格与蓝图一致 |
| [x] | P1-E02 | 系统卡片按蓝图重构 | `SystemCard.vue` | 图标、名称、编码协议、状态、凭证 chip、三列 meta 一致 |
| [x] | P1-E03 | 首页 KPI 接真实 API | `SystemsTabView.vue`, `ucp.ts` | 6 个 KPI 不含前端硬编码 |
| [x] | P1-E04 | 卡片数据接真实 API | `SystemCard.vue`, `ucp.ts` | 资源数、流水线数、24h 同步次数来自接口 |
| [x] | P1-E05 | 凭证 chip 接真实凭证 | `SystemCard.vue` | prod/staging/dev 与接口一致，过期状态正确 |
| [x] | P1-E06 | 首页筛选可用 | `SystemsTabView.vue` | 全部/运行中/停用/异常筛选结果正确 |
| [x] | P1-E07 | 笔记本屏幕适配 | `SystemsTabView.vue`, `SystemCard.vue` | 1366px 下无横向溢出，关键内容完整显示 |

### F. 新建系统 4 步向导

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-F01 | 新增系统向导组件 | `SystemCreateWizard.vue` | 点击添加系统进入 4 步向导 |
| [x] | P1-F02 | Step1 系统信息 | `SystemCreateWizard.vue` | 可填写名称、编码、类型、协议、负责人 |
| [x] | P1-F03 | Step2 凭证录入 | `SystemCreateWizard.vue` | 可填写 prod 凭证，secret 不明文回显 |
| [x] | P1-F04 | Step3 资源配置 | `SystemCreateWizard.vue` | 至少可创建一个 API 或表资源 |
| [x] | P1-F05 | Step4 检查测试 | `SystemCreateWizard.vue`, 后端测试 API | 展示认证/连通性测试结果 |
| [x] | P1-F06 | 向导提交创建完整对象 | 前后端 | 提交后同时创建 system、credential、resource |
| [x] | P1-F07 | 创建完成刷新首页 | `SystemsTabView.vue` | 新系统卡片立即出现 |

### G. 系统详情 6 Tab

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-G01 | 系统详情抽屉按蓝图重构 | `SystemDetailDrawer.vue` | 以抽屉展示，顶部信息与蓝图一致 |
| [x] | P1-G02 | 概览 Tab | `SystemDetailDrawer.vue` | 展示系统状态、资源数、凭证数、最近同步 |
| [x] | P1-G03 | 资源 Tab | `SystemDetailDrawer.vue` | 展示资源列表，可新增资源 |
| [x] | P1-G04 | 凭证 Tab | `SystemDetailDrawer.vue` | 展示凭证列表，可补充凭证、设主用 |
| [x] | P1-G05 | 流水线 Tab | `SystemDetailDrawer.vue` | 展示引用该系统资源的流水线 |
| [x] | P1-G06 | 执行记录 Tab | `SystemDetailDrawer.vue` | 展示按 system_id 过滤的执行记录 |
| [x] | P1-G07 | 审计/测试 Tab | `SystemDetailDrawer.vue` | 展示测试记录和配置变更摘要 |

### H. 流水线列表

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-H01 | 重构流水线列表 | `PipelinesTabView.vue` 或 `PipelineListView.vue` | 列包含名称、系统、资源、触发方式、最近执行、状态 |
| [x] | P1-H02 | 新建流水线入口 | 流水线页面 | 点击后可选择空白画布或模板 |
| [x] | P1-H03 | 新建模板入口 | 流水线页面 | 点击后进入模板画布设计 |
| [x] | P1-H04 | 流水线筛选 | 流水线页面 | 可按系统、资源、触发方式、状态筛选 |

### I. 流水线画布最小可用

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-I01 | 画布页面结构 | `PipelineDesignerView.vue` | 左节点面板、中画布、右属性面板、顶部操作区完整 |
| [x] | P1-I02 | 节点拖拽/添加 | `PipelineDesignerView.vue` | 可添加 RESOURCE、LOOP_RESOURCE、TRANSFORM、NOTIFY 节点 |
| [x] | P1-I03 | 节点连线 | `PipelineDesignerView.vue` | 可连接节点并保存 edges |
| [x] | P1-I04 | RESOURCE 节点配置 | `PipelineDesignerView.vue` | 可选择系统 → 资源 → 凭证 |
| [x] | P1-I05 | LOOP_RESOURCE 节点配置 | `PipelineDesignerView.vue` | 可选择循环输入、资源、凭证、并发度 |
| [x] | P1-I06 | TRANSFORM 节点配置 | `PipelineDesignerView.vue` | 可配置输入 key、输出 key、转换类型 |
| [x] | P1-I07 | NOTIFY 节点配置 | `PipelineDesignerView.vue` | 可配置通知模板、接收人、触发条件 |
| [x] | P1-I08 | 节点校验 | `PipelineDesignerView.vue` | 未选择资源/凭证时节点显示校验错误 |
| [x] | P1-I09 | 保存模板 | `PipelineDesignerView.vue`, API | 保存后 nodes/edges 入库 |
| [x] | P1-I10 | 重新打开模板 | `PipelineDesignerView.vue` | 节点位置、连线、配置完整恢复 |
| [x] | P1-I11 | 从模板创建流水线 | `PipelineDesignerView.vue`, API | 模板可生成可执行流水线 |
| [x] | P1-I12 | 试运行 | `PipelineDesignerView.vue`, API | 点击试运行返回 trace_id 和步骤状态 |
| [x] | P1-I13 | 发布流水线 | `PipelineDesignerView.vue`, API | 发布后列表可见，状态为启用 |

### J. 流水线执行引擎最小闭环

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-J01 | RESOURCE 节点执行 | `pipeline_engine.py` | 可调用资源配置对应 adapter |
| [x] | P1-J02 | LOOP_RESOURCE 节点执行 | `pipeline_engine.py` | 可循环处理列表并记录成功/失败项 |
| [x] | P1-J03 | TRANSFORM 节点执行 | `pipeline_engine.py` | 可完成字段提取、合并、upsert 中至少一种 |
| [x] | P1-J04 | NOTIFY 节点执行 | `pipeline_engine.py`, `notifier.py` | 可发送执行结果通知 |
| [x] | P1-J05 | 执行状态 | `pipeline_engine.py` | 支持 SUCCESS、FAILED、PARTIAL_SUCCESS、RUNNING |
| [x] | P1-J06 | Trace ID | `pipeline_engine.py` | 每次运行生成唯一 trace_id |
| [x] | P1-J07 | Step Run | `pipeline_engine.py`, models | 每个节点生成步骤执行记录 |
| [x] | P1-J08 | Context Summary | `pipeline_engine.py` | 保存脱敏摘要，不保存敏感明文 |

### K. 执行日志与详情

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P1-K01 | 执行日志列表 | `PipelineExecList.vue` | 可按流水线、时间、状态过滤 |
| [x] | P1-K02 | 执行详情页 | `PipelineExecDetail.vue` | 展示 trace_id、状态、耗时、步骤列表 |
| [x] | P1-K03 | 步骤时间线 | `PipelineExecDetail.vue` | 按画布节点顺序展示执行状态 |
| [x] | P1-K04 | 通知结果展示 | `PipelineExecDetail.vue` | 可看到通知是否发送成功 |
| [x] | P1-K05 | 敏感字段脱敏 | 前后端 | 薪酬、手机号、token 不明文展示 |

### L. 示例流水线验收

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P1-L01 | 创建 Offer 同步模板 | 画布模板 | 包含北森拉取、飞书 Offer 循环、合并写入、通知节点 |
| [ ] | P1-L02 | Offer 同步全成功 | 执行引擎/测试数据 | 10 条数据全部成功，状态 SUCCESS |
| [ ] | P1-L03 | Offer 部分失败 | 执行引擎/测试数据 | 部分失败时状态 PARTIAL_SUCCESS |
| [ ] | P1-L04 | Offer 未找到 | 执行引擎/测试数据 | OFFER_NOT_FOUND 单独统计，不算接口失败 |
| [ ] | P1-L05 | 幂等写入 | 执行引擎/目标表 | 重跑不产生重复数据 |
| [ ] | P1-L06 | 通知闭环 | 通知服务 | 通知展示待入职数、成功数、失败数、写入数 |

---

## 5.2 Phase 2：资源/凭证/执行运维增强

### A. 资源详情与反向引用

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-A01 | 资源详情抽屉/页面 | `ResourceDetailDrawer.vue`, Resource API | 展示资源名称、类型、协议、所属系统、状态、最近测试结果 |
| [x] | P2-A02 | 资源动作配置展示 | Resource 组件/API | 可查看 endpoint/table/action、请求方式、参数摘要、字段映射摘要 |
| [x] | P2-A03 | 资源关联凭证展示 | Resource 详情、Credential API | 展示该资源可用凭证环境和主用凭证，不泄露 secret |
| [x] | P2-A04 | 资源反向引用流水线 | `/resources/{id}/pipelines` | 能看到引用该资源的所有模板、流水线、节点编号 |
| [x] | P2-A05 | 删除资源影响分析 | 前端确认弹窗、后端校验 | 删除前列出受影响流水线；有启用流水线引用时默认禁止删除 |
| [x] | P2-A06 | 资源停用机制 | Resource API | 停用后新执行不得调用该资源，历史执行记录仍可查看 |

### B. 凭证生命周期增强

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-B01 | 凭证主备切换 | `SystemDetailDrawer.vue`, Credential API | 可将同环境或指定环境凭证设为主用，原主用自动降为备用 |
| [x] | P2-B02 | 凭证过期状态计算 | Credential Service | 支持正常、即将过期、已过期、停用状态，首页 chip 同步展示 |
| [~] | P2-B03 | 凭证到期提醒配置 | Credential UI/Notification | 可配置提前 N 天提醒，提醒记录可追踪 |
| [x] | P2-B04 | 凭证轮换记录 | Audit Log | 新增、更新、设主用、停用均记录操作人和时间，不记录密钥明文 |
| [x] | P2-B05 | 凭证可用范围 | Credential Model/API | 可限制凭证适用资源、环境和执行主体 |
| [x] | P2-B06 | 凭证安全回显 | 前端表单/后端 DTO | secret 永不明文回显，仅显示脱敏摘要和更新时间 |

### C. 测试引擎增强

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-C01 | 认证测试 | Test Engine/Credential API | 凭证保存后可测试认证，返回成功/失败和脱敏错误信息 |
| [x] | P2-C02 | 资源连通性测试 | Test Engine/Resource API | 可对指定资源执行连通性测试，记录 trace_id |
| [x] | P2-C03 | 样例数据预览 | Test Engine/Preview UI | 可拉取有限条样例数据，手机号、token、薪酬等字段脱敏 |
| [x] | P2-C04 | 测试历史记录 | Test Log Model/UI | 系统详情“审计/测试”Tab 可查看测试历史 |
| [x] | P2-C05 | 测试失败诊断 | Test Engine | 返回标准错误码、建议处理动作和外部错误摘要 |

### D. 失败项与重跑

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-D01 | LOOP_RESOURCE item 记录 | Pipeline Engine/Models | 每个循环 item 有状态、输入摘要、输出摘要、错误码 |
| [x] | P2-D02 | 失败项列表 | `PipelineExecDetail.vue` | 执行详情可筛选查看失败 item |
| [~] | P2-D03 | 单项重跑 | Retry API/Engine | 可选择一个失败 item 重跑，生成新的 step run 关联原 item |
| [x] | P2-D04 | 批量重跑失败项 | Retry API/UI | 可一键重跑本次执行全部失败项，并展示重跑结果 |
| [x] | P2-D05 | 重跑幂等保护 | Engine/Adapter | 重跑不会造成重复写入，幂等键写入执行记录 |
| [x] | P2-D06 | 重跑权限控制 | Permission/Audit | 只有授权角色可重跑，操作进入审计日志 |

### E. 通知模板管理

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-E01 | 通知模板列表 | Notification Template UI/API | 可查看模板名称、渠道、适用流水线、启停状态 |
| [x] | P2-E02 | 通知模板编辑 | Template Editor | 支持变量插入、内容预览、保存版本 |
| [x] | P2-E03 | 通知模板试发 | Notification Service | 可向测试接收人试发，记录发送结果 |
| [x] | P2-E04 | NOTIFY 节点绑定模板 | Pipeline Designer | NOTIFY 节点可选择模板并配置接收人 |
| [x] | P2-E05 | 通知去重 | Notification Service | 同一 trace_id 的同类通知可配置去重策略 |

### F. 监控中心基础版

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P2-F01 | 监控首页基础布局 | `MonitorDashboardView.vue` | 展示 24h 执行数、成功率、失败率、平均耗时 |
| [x] | P2-F02 | 系统维度监控 | Monitor API/UI | 可按系统查看执行量、失败量、最近异常 |
| [x] | P2-F03 | 流水线维度监控 | Monitor API/UI | 可按流水线查看成功率、耗时和最近执行 |
| [x] | P2-F04 | 异常列表 | Monitor UI | 可查看最近失败执行、死信预警、凭证过期预警 |
| [x] | P2-F05 | 监控数据真实聚合 | Monitor Service | 指标来自 Pipeline Run/Step Run/Credential，不使用前端假数据 |

---

## 5.3 Phase 3：事件驱动和死信

### A. 事件模型与 API

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-A01 | 定义事件模型 | Event Models/Migration | 包含 source、event_type、event_key、payload、status、trace_id、received_at |
| [x] | P3-A02 | 事件去重键 | Event Service | 同一 source + event_key 重复投递可识别并标记 |
| [x] | P3-A03 | 事件列表 API | Event Router/API | 支持按来源、类型、状态、时间、trace_id 查询 |
| [x] | P3-A04 | 事件详情 API | Event Router/API | 返回 payload 摘要、时间线、派发记录、关联流水线 |

### B. 事件中心前端

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-B01 | 事件列表页面 | `EventListView.vue` | 展示事件来源、类型、状态、接收时间、trace_id |
| [x] | P3-B02 | 事件筛选搜索 | Event UI | 可按来源、事件类型、状态、时间范围筛选 |
| [x] | P3-B03 | 事件详情页面 | `EventDetailView.vue` | 展示事件时间线、payload 脱敏预览、派发历史 |
| [x] | P3-B04 | 事件关联跳转 | Event UI | 可跳转到关联流水线执行详情或死信记录 |

### C. 触发器配置

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-C01 | 触发器模型 | Trigger Models/API | 包含来源、事件类型、过滤条件、目标流水线、启停状态 |
| [x] | P3-C02 | 触发器配置页面 | `EventTriggerConfigView.vue` | 可新增、编辑、启停触发器 |
| [x] | P3-C03 | 过滤条件配置 | Trigger UI/Service | 支持按 payload 字段、系统、资源条件过滤 |
| [~] | P3-C04 | 触发器测试 | Trigger Test API | 可用样例 payload 验证是否命中目标流水线 |

### D. 飞书 Webhook 接入

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-D01 | 飞书 challenge 处理 | Webhook Router | 支持飞书 URL 校验 challenge |
| [x] | P3-D02 | 飞书验签 | Webhook Service | 非法签名请求被拒绝并记录安全日志 |
| [x] | P3-D03 | 飞书事件标准化 | Event Adapter | 飞书原始事件转换为 UCP 标准事件模型 |
| [x] | P3-D04 | 飞书事件幂等 | Event Service | 重复 event_id 不重复触发流水线 |

### E. 事件派发与流水线触发

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-E01 | 事件派发器 | Event Bus/Dispatcher | 命中触发器后创建 Pipeline Run |
| [x] | P3-E02 | 事件上下文注入 | Pipeline Engine | 事件 payload 可作为画布起始上下文使用 |
| [x] | P3-E03 | 派发状态记录 | Event Dispatch Log | 记录命中、跳过、成功、失败状态 |
| [x] | P3-E04 | 派发失败重试 | Dispatcher | 支持按重试策略再次派发 |

### F. 死信队列

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P3-F01 | 死信模型 | Dead Letter Models/API | 记录事件、失败原因、重试次数、下一次重试时间、状态 |
| [x] | P3-F02 | 死信列表 | `DeadLetterListView.vue` | 可按来源、类型、失败原因、状态筛选 |
| [x] | P3-F03 | 死信详情 | Dead Letter UI | 展示 payload 脱敏摘要、失败堆栈摘要、重试历史 |
| [x] | P3-F04 | 死信重放 | Dead Letter API | 可重放指定死信并更新状态和 trace_id |
| [x] | P3-F05 | 死信丢弃 | Dead Letter API | 可丢弃死信，必须填写原因并记录操作人 |
| [x] | P3-F06 | 到期重试扫描 | Scheduler/Worker | 定时扫描到期死信并按策略重试 |

---

## 5.4 Phase 4：高级自动化与完整监控

### A. 高级画布节点

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P4-A01 | BRANCH 节点 UI | Pipeline Designer | 可配置条件表达式和多出口连线 |
| [x] | P4-A02 | BRANCH 节点执行 | Pipeline Engine | 根据上下文条件只执行命中分支 |
| [x] | P4-A03 | WAIT 节点 UI | Pipeline Designer | 支持固定时长等待、等待到指定时间、等待事件三类配置 |
| [x] | P4-A04 | WAIT 节点执行 | Pipeline Engine/Scheduler | 等待期间 run 状态可恢复，不阻塞主进程 |
| [x] | P4-A05 | APPROVAL 节点 UI | Pipeline Designer | 可配置审批人、审批原因、超时策略 |
| [x] | P4-A06 | APPROVAL 节点执行 | Approval Service/Engine | 执行到审批节点时暂停，审批通过后继续，拒绝后终止 |

### B. 审批中心

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P4-B01 | 审批任务模型 | Approval Models/API | 包含申请人、审批人、关联 run、状态、意见、时间 |
| [x] | P4-B02 | 我的审批列表 | Approval UI | 审批人可查看待处理、已处理任务 |
| [x] | P4-B03 | 审批详情 | Approval UI | 展示高风险动作、上下文摘要、影响范围和脱敏数据 |
| [x] | P4-B04 | 审批操作 | Approval API | 支持通过、拒绝、转交，操作进入审计日志 |
| [x] | P4-B05 | 审批通知 | Notification Service | 新审批、超时、处理结果可通知相关人 |

### C. 外部账号自动化

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P4-C01 | 外部账号动作资源 | Resource/Adapter | 支持创建、停用、删除账号动作资源 |
| [x] | P4-C02 | 入职账号创建流水线 | Pipeline Template | 飞书/HR 入职事件可触发账号创建流程 |
| [x] | P4-C03 | 离职账号停用流水线 | Pipeline Template | 离职事件可触发滴滴、曹操等账号停用 |
| [x] | P4-C04 | 账号动作幂等 | Adapter/Engine | 重复事件不会重复创建或重复删除账号 |
| [x] | P4-C05 | 高风险审批接入 | Approval Node | 删除/停用账号可配置审批后执行 |

### D. OA 组织同步

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P4-D01 | OA 组织资源定义 | Resource/Adapter | 可配置组织查询、创建、更新、停用资源动作 |
| [x] | P4-D02 | 组织差异计算 | Compare Service | 可比较 HR Portal 组织与 OA 组织差异 |
| [x] | P4-D03 | OA 同步流水线模板 | Pipeline Template | 支持按差异结果执行新增、更新、停用 |
| [x] | P4-D04 | 组织同步预演 | Pipeline Engine/UI | 正式执行前可预览影响组织数量和动作 |
| [x] | P4-D05 | 组织同步审计 | Audit/Run Detail | 每个组织变更动作有执行记录和外部响应摘要 |

### E. 完整监控与告警

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P4-E01 | 监控时间范围切换 | Monitor UI/API | 支持 4h、24h、7d、30d 维度切换 |
| [x] | P4-E02 | 趋势图 | Monitor UI/API | 展示执行量、失败率、耗时趋势 |
| [~] | P4-E03 | 告警规则配置 | Alert UI/API | 可配置失败率、连续失败、耗时、死信数量阈值 |
| [~] | P4-E04 | 告警订阅 | Alert/Notification | 用户可订阅系统、资源、流水线告警 |
| [x] | P4-E05 | 告警记录 | Alert Log UI | 可查看触发时间、恢复时间、通知状态 |
| [x] | P4-E06 | 审计日志完善 | Audit UI/API | 配置变更、凭证读取、手动执行、审批操作均可追踪 |

---

## 5.5 Phase 5：通用 API 配置化能力（远期）

### A. REST API 资源配置器

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P5-A01 | API 基础配置表单 | Resource Form/API | 可配置 method、base_url、path、timeout、content_type |
| [ ] | P5-A02 | Header 配置 | Resource Form | 支持静态值、凭证引用、变量引用三种 header |
| [ ] | P5-A03 | Query 配置 | Resource Form | 支持 key/value、必填、默认值、变量引用 |
| [ ] | P5-A04 | Body 模板配置 | Resource Form | 支持 JSON body 模板和上游变量引用 |
| [ ] | P5-A05 | 请求预览 | Resource UI | 可预览最终请求摘要，敏感字段脱敏 |

### B. 认证能力扩展

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P5-B01 | API Key 认证 | Credential/Adapter | 支持 header/query 两种 API Key 注入 |
| [ ] | P5-B02 | Bearer Token 认证 | Credential/Adapter | 支持 token 存储、脱敏展示和请求注入 |
| [ ] | P5-B03 | Basic Auth | Credential/Adapter | 支持用户名密码加密存储和请求注入 |
| [ ] | P5-B04 | OAuth2 Client Credentials | Credential/Adapter | 支持 token 获取、缓存、过期刷新 |
| [ ] | P5-B05 | 认证测试统一化 | Test Engine | 各认证方式均可执行认证测试并返回标准结果 |

### C. 请求/响应模板

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P5-C01 | 模板变量语法 | Template Engine | 支持引用上游节点输出、系统变量、执行时间 |
| [ ] | P5-C02 | 响应 data_path 配置 | Resource Form/Adapter | 可配置数据列表路径并成功提取数组 |
| [ ] | P5-C03 | 响应 total_path 配置 | Resource Form/Adapter | 可提取总数用于分页和监控 |
| [ ] | P5-C04 | 响应 next_cursor_path 配置 | Resource Form/Adapter | 可提取下一页 cursor |
| [ ] | P5-C05 | 错误码映射 | Resource Form/Adapter | 可将外部错误码映射为 UCP 标准错误码 |

### D. 分页、限流、重试与映射

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P5-D01 | page/pageSize 分页 | Adapter | 可按页码分页拉取完整数据 |
| [ ] | P5-D02 | offset/limit 分页 | Adapter | 可按偏移分页拉取完整数据 |
| [ ] | P5-D03 | cursor 分页 | Adapter | 可按 cursor 拉取直到结束 |
| [ ] | P5-D04 | 限流配置 | Adapter/Engine | 可配置 QPS、并发数、退避策略 |
| [ ] | P5-D05 | 字段映射 UI | Mapping UI | 可把响应字段映射为标准输出字段 |
| [ ] | P5-D06 | 映射测试 | Mapping Engine | 样例响应可验证映射结果 |

### E. API 模板库与安全边界

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P5-E01 | API 模板库 | Template Library UI/API | 可保存、复制、导入、导出 API 资源模板 |
| [ ] | P5-E02 | 模板版本 | Template Library | 模板修改生成版本，可回滚 |
| [ ] | P5-E03 | API 预览测试 | Test Engine | 可拉取样例数据，敏感字段脱敏 |
| [ ] | P5-E04 | SSRF 防护 | Backend Security | 禁止访问内网敏感地址、metadata 地址和未授权域名 |
| [ ] | P5-E05 | 安全审计 | Audit Log | API 测试、模板发布、凭证引用均有审计记录 |

---

## 5.6 Phase 6：集成治理 / iPaaS 能力雏形（远期）

### A. 集成资产目录

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P6-A01 | 资产目录聚合 API | Asset Catalog Service | 聚合系统、资源、凭证、流水线、事件、模板数量和状态 |
| [ ] | P6-A02 | 资产目录页面 | Asset Catalog UI | 可按业务域、负责人、状态查看集成资产 |
| [ ] | P6-A03 | 资产详情跳转 | Asset Catalog UI | 可从目录跳转到系统、资源、流水线详情 |
| [ ] | P6-A04 | 资产标签 | Asset Model/UI | 支持业务域、重要级别、负责人、数据敏感级别标签 |

### B. 依赖拓扑

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P6-B01 | 依赖关系抽取 | Topology Service | 从流水线 nodes/edges 抽取系统、资源、流水线依赖 |
| [ ] | P6-B02 | 拓扑图页面 | Topology UI | 可查看跨系统依赖图和关键路径 |
| [ ] | P6-B03 | 影响分析 | Topology API/UI | 选择系统/资源时展示受影响流水线和下游系统 |
| [ ] | P6-B04 | 拓扑筛选 | Topology UI | 支持按业务域、系统、资源类型、状态筛选 |

### C. SLA 与告警治理

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P6-C01 | SLA 指标模型 | Monitor Models | 支持按系统/资源/流水线统计成功率、P95 耗时、失败率 |
| [ ] | P6-C02 | SLA 目标配置 | SLA UI/API | 可配置目标成功率、最大耗时、恢复时间 |
| [ ] | P6-C03 | SLA 看板 | SLA Dashboard | 可查看达标、未达标、趋势和责任人 |
| [ ] | P6-C04 | 告警规则中心 | Alert Center | 集中管理失败率、耗时、连续失败、死信数量阈值 |
| [ ] | P6-C05 | 告警订阅矩阵 | Alert Subscription | 可按团队、系统、流水线订阅告警 |

### D. 变更审批与发布治理

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P6-D01 | 集成变更单 | Change Models/API | 资源、凭证、流水线发布可生成变更单 |
| [ ] | P6-D02 | 变更审批流程 | Approval/Change UI | 高风险变更必须审批后发布 |
| [ ] | P6-D03 | 发布窗口控制 | Change Service | 可限制生产发布时段 |
| [ ] | P6-D04 | 变更回滚 | Template/Resource Version | 支持回滚到上一稳定版本 |
| [ ] | P6-D05 | 变更影响预览 | Topology/Change UI | 发布前展示影响系统、流水线、下游资产 |

### E. 团队隔离与报表

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P6-E01 | 业务域权限模型 | Permission Models | 不同团队只能管理授权业务域资产 |
| [ ] | P6-E02 | 多团队视图 | Asset/Monitor UI | 用户可切换有权限的业务域视图 |
| [ ] | P6-E03 | 集成运行月报 | Report Service | 可生成系统/团队维度运行质量报告 |
| [ ] | P6-E04 | 报表导出 | Report UI/API | 支持导出月报，敏感信息脱敏 |
| [ ] | P6-E05 | 治理评分 | Governance Service | 可按失败率、SLA、告警、凭证风险形成评分 |

---

## 5.7 Phase 7：外部系统主数据治理协同（远期）

### A. 外部主数据目录

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-A01 | 主数据对象模型 | Master Data Models | 支持人员、组织、岗位、账号等对象类型 |
| [ ] | P7-A02 | 外部主数据目录页面 | Master Data UI | 可按系统查看外部主数据对象、负责人、同步状态 |
| [ ] | P7-A03 | 主数据字段目录 | Master Data UI/API | 可登记外部字段、标准字段、敏感级别、来源说明 |
| [ ] | P7-A04 | 主数据来源标识 | Master Data Model | 标记权威来源、参考来源、消费来源 |

### B. 外部 ID 映射

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-B01 | ID 映射模型 | Mapping Models/API | 维护 HR Portal ID 与外部系统 ID 的多对一/一对多映射 |
| [ ] | P7-B02 | ID 映射页面 | Mapping UI | 可查询、导入、修正、停用映射关系 |
| [ ] | P7-B03 | 映射冲突检测 | Mapping Service | 能识别重复映射、缺失映射、孤儿映射 |
| [ ] | P7-B04 | 映射变更审计 | Audit Log | 映射新增、修改、删除均记录操作人、原因和前后值 |

### C. 差异检测

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-C01 | 差异检测任务配置 | Diff Job UI/API | 可配置比较对象、字段、频率、数据范围 |
| [ ] | P7-C02 | 差异计算引擎 | Diff Engine | 可比较 HR Portal 与外部系统主数据差异 |
| [ ] | P7-C03 | 差异结果列表 | Diff UI | 展示缺失、多余、字段不一致、映射异常 |
| [ ] | P7-C04 | 差异结果详情 | Diff UI | 展示字段级差异、来源值、目标值和建议动作 |
| [ ] | P7-C05 | 差异趋势 | Diff Monitor | 可查看差异数量随时间变化 |

### D. 数据质量规则

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-D01 | 质量规则模型 | Rule Engine/API | 支持必填、唯一、格式、枚举、引用完整性规则 |
| [ ] | P7-D02 | 质量规则配置 UI | Rule UI | 可按对象和字段配置质量规则 |
| [ ] | P7-D03 | 质量扫描任务 | Rule Engine/Scheduler | 可定期扫描并生成问题列表 |
| [ ] | P7-D04 | 质量问题详情 | Quality UI | 展示问题字段、规则、来源系统、建议修复方式 |
| [ ] | P7-D05 | 质量规则试运行 | Rule Engine/UI | 发布规则前可用样例数据验证 |

### E. 冲突处理工作台

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-E01 | 冲突列表 | Conflict Workbench UI | 可查看差异冲突、质量冲突、映射冲突 |
| [ ] | P7-E02 | 冲突处理策略 | Conflict Service | 支持以 HR Portal 为准、以外部为准、手工修正、忽略 |
| [ ] | P7-E03 | 冲突处理详情 | Conflict UI | 处理前展示影响范围和字段级对比 |
| [ ] | P7-E04 | 冲突处理执行 | Conflict Service/Pipeline | 处理动作可触发修复流水线或生成任务 |
| [ ] | P7-E05 | 冲突处理审计 | Audit Log | 记录处理人、处理策略、原因、前后值 |

### F. 治理流程与影响分析

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [ ] | P7-F01 | 主数据变更影响分析 | Topology/Diff Service | 可分析字段、组织、账号变更影响哪些流水线和系统 |
| [ ] | P7-F02 | 治理任务派发 | Task/Notification | 可把问题分派给负责人并通知 |
| [ ] | P7-F03 | 治理任务跟踪 | Governance Task UI | 可查看待处理、处理中、已完成、逾期任务 |
| [ ] | P7-F04 | 整改验证 | Diff/Rule Engine | 整改后可重新检测并关闭问题 |
| [ ] | P7-F05 | 治理闭环报表 | Governance Report | 可按系统、对象、负责人统计问题和闭环率 |
| [ ] | P7-F06 | 治理审计 | Audit Log | 主数据映射、差异处理、质量规则、冲突处理均有审计记录 |

---

## 6. 数据真实性验收规则

任何页面不得用前端硬编码伪造核心数据。

### 6.1 首页必须真实

以下字段必须来自 API：

- 接入系统数
- 资源数
- 凭证数
- 主凭证数 / 备凭证数
- 活跃流水线数
- 运行中流水线数
- 24h 同步次数
- 失败率
- 每个系统资源数
- 每个系统流水线数
- 每个系统 24h 同步次数
- 凭证过期状态
- 系统健康状态

### 6.2 画布必须真实

- 节点选择的系统来自系统 API。
- 节点选择的资源来自资源 API。
- 节点选择的凭证来自该系统下凭证 API。
- 保存模板后必须能重新打开恢复。
- 试运行必须产生真实 trace_id。

### 6.3 执行必须真实

- 执行记录来自后端执行表。
- 步骤状态来自 Step Run。
- 失败项来自 LOOP_RESOURCE item 记录。
- 通知结果来自通知日志。
- 监控数据来自执行记录聚合。

---

## 7. 发布与检查

前端构建：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\frontend
npm.cmd run build
```

Docker 发布：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal
docker compose build frontend
docker compose up -d frontend
```

蓝图同步：

```powershell
cd D:\AI项目\HR提效工具搭建
Copy-Item -Recurse -Force outputs\ucp-blueprint hr-portal\frontend\public\outputs\ucp-blueprint
```

检查：

```powershell
docker compose ps frontend
```

---

## 8. 开发纪律

1. 不再以兼容旧 Connector 产品模型为目标。
2. 新代码以 System / Resource / Credential / Pipeline / Template / Event 命名。
2.1 UCP 导航、路由、权限按未来可独立应用预留：顶部一级 `数据连接`、路由 `/ucp`、权限 code `ucp.*`。
3. 蓝图 15 个场景是最终产品状态，分期只是交付节奏。
4. 流水线画布是第一阶段核心能力，不后置。
5. 每个任务完成后必须更新任务表状态。
6. 每个任务必须满足验收标准才能标记完成。
7. 涉及凭证、薪酬、手机号、token 的数据必须脱敏。
8. 每次发布前必须重新构建前端并确认 Docker 前端已更新。
9. 蓝图文件必须保持可访问。



