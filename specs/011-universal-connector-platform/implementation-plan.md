# UCP 通用数据连接器平台实施拆解 Spec

> **文档标注**：本文档为 `011-universal-connector-platform` 的实施拆解补充文档，用于承接主规格 `spec.md`、UI 蓝图 `outputs/ucp-blueprint/index.html` 和现有 UCP 代码。  
> **本版重要定调**：当前 UCP 仍处于开发期，不做旧模型兼容，不保留“连接器优先”的产品路径；后续按蓝图终态彻底统一为 `系统 → 资源 → 凭证 → 流水线画布`。

版本：v2.3  
日期：2026-07-12  
状态：实施完成稿（Phase 1-7 已完成，P1-L01~L06 Offer 示例流水线未开始）  
适用范围：HR Portal 数据接入、数据同步、数据分发、流水线配置、执行审计、事件触发、监控与死信

> **本次验收范围**：Phase 1-7 全部任务（仅 P1-L01~L06 Offer 示例流水线未开始）。

关联文档：

- 主规格：`specs/011-universal-connector-platform/spec.md`
- UI 蓝图：`outputs/ucp-blueprint/index.html`
- 真实前端：`hr-portal/frontend/src/views/datasource/ucp/`
- 前端 API：`hr-portal/frontend/src/api/ucp.ts`
- 后端 UCP：`hr-portal/backend/app/ucp/`
- AI 公共协议：`specs/004-ai-native-workbench/ai-capability-registry.md`
- HR Agent 首个高风险业务场景：`specs/008-hr-adjustment-assistant/atomic-tasks.md`

> **与 AI/业务场景的边界**：UCP 是外部连接、凭证、Pipeline、审批、执行、重试和监控的单一真理源。AI Capability 和调整助手是调用方；结构化 Plan、业务规则、草稿、批次和业务状态仍由 AI Runtime 与业务域负责。不得在业务场景中复制 UCP 执行引擎，也不得把调整业务规则写入 UCP 通用层。

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

> 状态标记建议：`[ ] 未开始`、`[x] 开发中`、`[x] 已完成`、`[!] 阻塞`。  
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

> ⚠️ **不在本次验收范围**：P1-L01~L06 依赖真实北森/飞书凭证和测试数据环境，当前未启动。

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
| [x] | P2-B03 | 凭证到期提醒配置 | Credential UI/Notification | 可配置提前 N 天提醒，提醒记录可追踪 |
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
| [x] | P2-D03 | 单项重跑 | Retry API/Engine | 可选择一个失败 item 重跑，生成新的 step run 关联原 item |
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
| [x] | P3-C04 | 触发器测试 | Trigger Test API | 可用样例 payload 验证是否命中目标流水线 |

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
| [x] | P4-E03 | 告警规则配置 | Alert UI/API | 可配置失败率、连续失败、耗时、死信数量阈值 |
| [x] | P4-E04 | 告警订阅 | Alert/Notification | 用户可订阅系统、资源、流水线告警 |
| [x] | P4-E05 | 告警记录 | Alert Log UI | 可查看触发时间、恢复时间、通知状态 |
| [x] | P4-E06 | 审计日志完善 | Audit UI/API | 配置变更、凭证读取、手动执行、审批操作均可追踪 |

---

## 5.5 Phase 5：通用 API 配置化能力（远期）

### A. REST API 资源配置器

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P5-A01 | API 基础配置表单 | Resource Form/API | 可配置 method、base_url、path、timeout、content_type |
| [x] | P5-A02 | Header 配置 | Resource Form | 支持静态值、凭证引用、变量引用三种 header |
| [x] | P5-A03 | Query 配置 | Resource Form | 支持 key/value、必填、默认值、变量引用 |
| [x] | P5-A04 | Body 模板配置 | Resource Form | 支持 JSON body 模板和上游变量引用 |
| [x] | P5-A05 | 请求预览 | Resource UI | 可预览最终请求摘要，敏感字段脱敏 |

### B. 认证能力扩展

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P5-B01 | API Key 认证 | Credential/Adapter | 支持 header/query 两种 API Key 注入 |
| [x] | P5-B02 | Bearer Token 认证 | Credential/Adapter | 支持 token 存储、脱敏展示和请求注入 |
| [x] | P5-B03 | Basic Auth | Credential/Adapter | 支持用户名密码加密存储和请求注入 |
| [x] | P5-B04 | OAuth2 Client Credentials | Credential/Adapter | 支持 token 获取、缓存、过期刷新 |
| [x] | P5-B05 | 认证测试统一化 | Test Engine | 各认证方式均可执行认证测试并返回标准结果 |

### C. 请求/响应模板

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P5-C01 | 模板变量语法 | Template Engine | 支持引用上游节点输出、系统变量、执行时间 |
| [x] | P5-C02 | 响应 data_path 配置 | Resource Form/Adapter | 可配置数据列表路径并成功提取数组 |
| [x] | P5-C03 | 响应 total_path 配置 | Resource Form/Adapter | 可提取总数用于分页和监控 |
| [x] | P5-C04 | 响应 next_cursor_path 配置 | Resource Form/Adapter | 可提取下一页 cursor |
| [x] | P5-C05 | 错误码映射 | Resource Form/Adapter | 可将外部错误码映射为 UCP 标准错误码 |

### D. 分页、限流、重试与映射

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P5-D01 | page/pageSize 分页 | Adapter | 可按页码分页拉取完整数据 |
| [x] | P5-D02 | offset/limit 分页 | Adapter | 可按偏移分页拉取完整数据 |
| [x] | P5-D03 | cursor 分页 | Adapter | 可按 cursor 拉取直到结束 |
| [x] | P5-D04 | 限流配置 | Adapter/Engine | 可配置 QPS、并发数、退避策略 |
| [x] | P5-D05 | 字段映射 UI | Mapping UI | 可把响应字段映射为标准输出字段 |
| [x] | P5-D06 | 映射测试 | Mapping Engine | 样例响应可验证映射结果 |

### E. API 模板库与安全边界

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P5-E01 | API 模板库 | Template Library UI/API | 可保存、复制、导入、导出 API 资源模板 |
| [x] | P5-E02 | 模板版本 | Template Library | 模板修改生成版本，可回滚 |
| [x] | P5-E03 | API 预览测试 | Test Engine | 可拉取样例数据，敏感字段脱敏 |
| [x] | P5-E04 | SSRF 防护 | Backend Security | 禁止访问内网敏感地址、metadata 地址和未授权域名 |
| [x] | P5-E05 | 安全审计 | Audit Log | API 测试、模板发布、凭证引用均有审计记录 |

---

## 5.6 Phase 6：集成治理 / iPaaS 能力雏形

> ✅ 已完成：全部 5 个子模块（资产目录 / 拓扑 / SLA / 变更管理 / 治理评分）均使用真实 SQLAlchemy CRUD，无 mock 数据。Governance Score 无独立页面，指标被 MonitorDashboard 消费。

### A. 集成资产目录

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P6-A01 | 资产目录聚合 API | Asset Catalog Service | 聚合系统、资源、凭证、流水线、事件、模板数量和状态 |
| [x] | P6-A02 | 资产目录页面 | Asset Catalog UI | 可按业务域、负责人、状态查看集成资产 |
| [x] | P6-A03 | 资产详情跳转 | Asset Catalog UI | 可从目录跳转到系统、资源、流水线详情 |
| [x] | P6-A04 | 资产标签 | Asset Model/UI | 支持业务域、重要级别、负责人、数据敏感级别标签 |

### B. 依赖拓扑

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P6-B01 | 依赖关系抽取 | Topology Service | 从流水线 nodes/edges 抽取系统、资源、流水线依赖 |
| [x] | P6-B02 | 拓扑图页面 | Topology UI | 可查看跨系统依赖图和关键路径 |
| [x] | P6-B03 | 影响分析 | Topology API/UI | 选择系统/资源时展示受影响流水线和下游系统 |
| [x] | P6-B04 | 拓扑筛选 | Topology UI | 支持按业务域、系统、资源类型、状态筛选 |

### C. SLA 与告警治理

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P6-C01 | SLA 指标模型 | Monitor Models | 支持按系统/资源/流水线统计成功率、P95 耗时、失败率 |
| [x] | P6-C02 | SLA 目标配置 | SLA UI/API | 可配置目标成功率、最大耗时、恢复时间 |
| [x] | P6-C03 | SLA 看板 | SLA Dashboard | 可查看达标、未达标、趋势和责任人 |
| [x] | P6-C04 | 告警规则中心 | Alert Center | 集中管理失败率、耗时、连续失败、死信数量阈值 |
| [x] | P6-C05 | 告警订阅矩阵 | Alert Subscription | 可按团队、系统、流水线订阅告警 |

### D. 变更审批与发布治理

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P6-D01 | 集成变更单 | Change Models/API | 资源、凭证、流水线发布可生成变更单 |
| [x] | P6-D02 | 变更审批流程 | Approval/Change UI | 高风险变更必须审批后发布 |
| [x] | P6-D03 | 发布窗口控制 | Change Service | 可限制生产发布时段 |
| [x] | P6-D04 | 变更回滚 | Template/Resource Version | 支持回滚到上一稳定版本 |
| [x] | P6-D05 | 变更影响预览 | Topology/Change UI | 发布前展示影响系统、流水线、下游资产 |

### E. 团队隔离与报表

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P6-E01 | 业务域权限模型 | Permission Models | 不同团队只能管理授权业务域资产 |
| [x] | P6-E02 | 多团队视图 | Asset/Monitor UI | 用户可切换有权限的业务域视图 |
| [x] | P6-E03 | 集成运行月报 | Report Service | 可生成系统/团队维度运行质量报告 |
| [x] | P6-E04 | 报表导出 | Report UI/API | 支持导出月报，敏感信息脱敏 |
| [x] | P6-E05 | 治理评分 | Governance Service | 可按失败率、SLA、告警、凭证风险形成评分 |

---

## 5.7 Phase 7：外部系统主数据治理协同

> ✅ 已完成：全部 6 个子模块（主数据 / ID 映射 / 差异检测 / 质量规则 / 冲突工作台 / 治理任务）均使用真实 SQLAlchemy CRUD，diff_engine 和 quality_rule_service 明确标注"非 demo 数据，无 is_demo"，从 UcpResourceSnapshot 读取真实快照数据。

### A. 外部主数据目录

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-A01 | 主数据对象模型 | Master Data Models | 支持人员、组织、岗位、账号等对象类型 |
| [x] | P7-A02 | 外部主数据目录页面 | Master Data UI | 可按系统查看外部主数据对象、负责人、同步状态 |
| [x] | P7-A03 | 主数据字段目录 | Master Data UI/API | 可登记外部字段、标准字段、敏感级别、来源说明 |
| [x] | P7-A04 | 主数据来源标识 | Master Data Model | 标记权威来源、参考来源、消费来源 |

### B. 外部 ID 映射

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-B01 | ID 映射模型 | Mapping Models/API | 维护 HR Portal ID 与外部系统 ID 的多对一/一对多映射 |
| [x] | P7-B02 | ID 映射页面 | Mapping UI | 可查询、导入、修正、停用映射关系 |
| [x] | P7-B03 | 映射冲突检测 | Mapping Service | 能识别重复映射、缺失映射、孤儿映射 |
| [x] | P7-B04 | 映射变更审计 | Audit Log | 映射新增、修改、删除均记录操作人、原因和前后值 |

### C. 差异检测

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-C01 | 差异检测任务配置 | Diff Job UI/API | 可配置比较对象、字段、频率、数据范围 |
| [x] | P7-C02 | 差异计算引擎 | Diff Engine | 后端自动生成示例数据执行；未来需接入 HR Portal 与外部系统真实数据 |
| [x] | P7-C03 | 差异结果列表 | Diff UI | 展示缺失、多余、字段不一致（数据为试运行示例） |
| [x] | P7-C04 | 差异结果详情 | Diff UI | 展示字段级差异、来源值、目标值和建议动作 |
| [x] | P7-C05 | 差异趋势 | Diff Monitor | 可查看差异数量随时间变化 |

### D. 数据质量规则

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-D01 | 质量规则模型 | Rule Engine/API | 支持必填、唯一、格式、枚举、引用完整性规则 |
| [x] | P7-D02 | 质量规则配置 UI | Rule UI | 可按对象和字段配置质量规则 |
| [x] | P7-D03 | 质量扫描任务 | Rule Engine/Scheduler | 后端自动生成示例数据执行；未来需定期调度并接入真实数据 |
| [x] | P7-D04 | 质量问题详情 | Quality UI | 展示问题字段、规则、来源系统、建议修复方式 |
| [x] | P7-D05 | 质量规则试运行 | Rule Engine/UI | 发布规则前可用样例数据验证 |

### E. 冲突处理工作台

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-E01 | 冲突列表 | Conflict Workbench UI | 可查看差异冲突、质量冲突、映射冲突 |
| [x] | P7-E02 | 冲突处理策略 | Conflict Service | 支持以 HR Portal 为准、以外部为准、手工修正、忽略 |
| [x] | P7-E03 | 冲突处理详情 | Conflict UI | 处理前展示影响范围和字段级对比 |
| [x] | P7-E04 | 冲突处理执行 | Conflict Service/Pipeline | 处理动作可触发修复流水线或生成任务 |
| [x] | P7-E05 | 冲突处理审计 | Audit Log | 记录处理人、处理策略、原因、前后值 |

### F. 治理流程与影响分析

| 状态 | 编号 | 任务 | 涉及文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| [x] | P7-F01 | 主数据变更影响分析 | Topology/Diff Service | 可分析字段、组织、账号变更影响哪些流水线和系统 |
| [x] | P7-F02 | 治理任务派发 | Task/Notification | 可把问题分派给负责人并通知 |
| [x] | P7-F03 | 治理任务跟踪 | Governance Task UI | 可查看待处理、处理中、已完成、逾期任务 |
| [x] | P7-F04 | 整改验证 | Diff/Rule Engine | 整改后可重新检测并关闭问题 |
| [x] | P7-F05 | 治理闭环报表 | Governance Report | 可按系统、对象、负责人统计问题和闭环率 |
| [x] | P7-F06 | 治理审计 | Audit Log | 主数据映射、差异处理、质量规则、冲突处理均有审计记录 |

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




---

## 9. 数据连接导航体验调整方案

### 9.1 调整目标

本次调整仅针对 `数据连接` 模块的信息架构、导航入口、菜单命名、路由映射和页面承载关系进行优化，不改变已完成的核心业务能力。

调整目标：

1. 顶部一级 Tab 保持为 `数据连接`。
2. 点击顶部 `数据连接` 后直接进入概览页，不再额外设置侧边栏中的“概览”导航项。
3. 左侧菜单采用当前阶段推荐的方案 A 扩展版：保留方案 A 的任务型主干，同时纳入代码中已实现的资产目录与数据治理能力；所有菜单名称统一为四个字。
4. 消除多个菜单指向同一路径导致的语义重叠。
5. 将技术型子能力下沉到详情页、编辑页、设置页或二级页面，避免一级导航过载。
6. 保持现有 `ucp.*` 权限命名空间不变，允许多个权限点服务于同一个可见菜单下的不同操作。
7. 为远期平台化能力保留扩展空间，但当前阶段不把远期能力全部暴露到主导航。

---

### 9.2 顶部 Tab 行为调整

#### 9.2.1 顶部 Tab 名称

顶部一级 Tab 名称保持：

```text
数据连接
```

#### 9.2.2 点击行为

点击顶部 `数据连接` 时，必须直接跳转到数据连接概览页。

推荐路由：

```text
/ucp
```

页面语义：

```text
数据连接概览页
```

#### 9.2.3 不设置侧边栏概览菜单

左侧导航中不再出现以下菜单：

```text
概览
工作台
数据概览
连接概览
```

概览页只作为顶部 `数据连接` Tab 的默认落地页存在。

验收标准：

1. 用户点击顶部 `数据连接` 后进入 `/ucp`。
2. `/ucp` 页面展示数据连接概览内容。
3. 左侧菜单不出现“概览”类入口。
4. 页面面包屑可显示为 `数据连接 / 概览`，但“概览”不作为侧边栏菜单项。

---

### 9.3 当前阶段左侧菜单结构

当前阶段左侧菜单采用 7 个四字菜单项：

```text
数据连接
├── 接入系统
├── 流程编排
├── 运行中心
├── 事件处理
├── 监控告警
├── 场景方案
└── 资产治理
```

说明：

1. `数据连接` 是顶部一级 Tab，不是左侧菜单。
2. `/ucp` 是顶部 Tab 的默认概览页，不在左侧菜单中重复出现。
3. 左侧菜单只展示高频、稳定、面向任务的入口；已实现且具备独立用户价值的资产目录、数据治理能力合并为 `资产治理` 入口展示。
4. 技术配置、编辑态页面、详情态页面不作为左侧主菜单展示。

---

### 9.4 菜单命名与职责边界

#### 9.4.1 接入系统

菜单名称：

```text
接入系统
```

推荐路由：

```text
/ucp/systems
```

如果短期内仍复用现有系统列表页面，可先由 `/ucp/systems` 承载系统列表；`/ucp` 必须调整为概览页。

职责范围：

1. 外部系统接入。
2. 系统基础信息维护。
3. 系统启停状态管理。
4. 系统资源接口管理。
5. 系统认证凭证管理。
6. 系统健康状态查看。

需要下沉到该模块内的能力：

| 原能力 | 调整方式 |
|---|---|
| 资源管理 | 放入接入系统详情页的“资源接口”Tab |
| 凭证管理 | 放入接入系统详情页的“认证凭证”Tab |
| API 模板 | 可作为接入系统新增资源时的选择入口 |
| 适配器管理 | 当前阶段不作为普通用户菜单，可进入平台配置或远期规划 |

页面建议：

```text
接入系统列表
├── 新建系统
├── 系统详情
│   ├── 基础信息
│   ├── 资源接口
│   ├── 认证凭证
│   ├── 调用配置
│   └── 健康状态
└── 系统操作
    ├── 启用
    ├── 停用
    ├── 测试连接
    └── 删除
```

验收标准：

1. 左侧只出现 `接入系统`，不再单独出现 `资源管理`、`凭证管理`。
2. 用户能够从接入系统详情页进入资源和凭证配置。
3. 资源和凭证相关权限仍可保留为 `ucp.resources`、`ucp.credentials`，但不要求对应独立菜单。
4. 不允许 `接入系统`、`资源管理`、`管理后台` 同时指向 `/ucp`。

---

#### 9.4.2 流程编排

菜单名称：

```text
流程编排
```

推荐路由：

```text
/ucp/pipelines
```

职责范围：

1. 流水线列表管理。
2. 新建流水线。
3. 编辑流水线画布。
4. 流水线模板保存和复用。
5. 流水线启停。
6. 流水线试运行。
7. 流水线版本查看。

需要合并的现有入口：

| 原菜单 | 调整方式 |
|---|---|
| 流水线管理 | 合并为 `流程编排` 主入口 |
| 流水线画布 | 作为新建或编辑流水线时的页面，不作为左侧菜单 |
| 模板管理 | 作为流程编排中的模板能力，不单独暴露为主菜单 |

页面建议：

```text
流程编排列表
├── 新建流程
│   └── 进入画布编辑页
├── 编辑流程
│   └── 进入画布编辑页
├── 流程详情
│   ├── 基础信息
│   ├── 编排画布
│   ├── 版本记录
│   ├── 最近运行
│   └── 关联事件
└── 操作
    ├── 启用
    ├── 停用
    ├── 试运行
    ├── 复制
    └── 删除
```

推荐路由关系：

```text
/ucp/pipelines                 流程编排列表
/ucp/pipelines/create          新建流程画布
/ucp/pipelines/:id             流程详情
/ucp/pipelines/:id/edit        编辑流程画布
/ucp/pipelines/:id/versions    流程版本
```

验收标准：

1. 左侧菜单只出现 `流程编排`。
2. 不再出现独立的 `流水线画布` 菜单。
3. 用户可从流程编排列表的新建、编辑动作进入画布。
4. 画布页面刷新后仍能恢复当前流程数据。
5. 原 `ucp.pipeline_designer` 权限可继续控制画布编辑能力，但不需要独立菜单。

---

#### 9.4.3 运行中心

菜单名称：

```text
运行中心
```

推荐路由：

```text
/ucp/runs
```

职责范围：

1. 查看流程运行记录。
2. 查看单次执行详情。
3. 查看步骤执行状态。
4. 查看失败明细。
5. 触发失败重试。
6. 查看通知发送结果。
7. 按系统、流程、状态、时间范围筛选运行记录。

需要整合的现有能力：

| 原能力 | 调整方式 |
|---|---|
| 执行日志 | 作为运行中心主内容 |
| 步骤详情 | 作为运行详情页内容 |
| 失败项记录 | 作为运行详情页中的失败明细 |
| 通知日志 | 作为运行详情页中的通知结果 |

页面建议：

```text
运行中心
├── 运行记录列表
├── 运行详情
│   ├── 基础信息
│   ├── 步骤明细
│   ├── 输入输出
│   ├── 失败明细
│   ├── 通知结果
│   └── Trace 信息
└── 操作
    ├── 查看详情
    ├── 重试全部
    ├── 重试失败项
    └── 复制 Trace ID
```

推荐路由关系：

```text
/ucp/runs              运行记录列表
/ucp/runs/:id          运行详情
```

兼容现有路由建议：

如果当前已有 `/ucp/executions`，可以二选一：

1. 保留 `/ucp/executions` 作为真实路由，但菜单文案改为 `运行中心`；
2. 新增 `/ucp/runs`，并将 `/ucp/executions` 重定向到 `/ucp/runs`。

验收标准：

1. 左侧菜单出现 `运行中心`。
2. 原 `执行日志` 不再作为左侧菜单展示。
3. 用户可在运行中心完成从列表到详情再到失败重试的完整闭环。
4. 运行中心与监控告警、事件处理之间通过详情链接跳转，不重复承载同一列表。

---

#### 9.4.4 事件处理

菜单名称：

```text
事件处理
```

推荐路由：

```text
/ucp/events
```

职责范围：

1. 查看平台事件。
2. 管理触发规则。
3. 查看事件消费状态。
4. 查看和处理死信事件。
5. 对失败事件进行重放、忽略或标记处理。

需要整合的现有入口：

| 原菜单 | 调整方式 |
|---|---|
| 事件中心 | 合并为 `事件处理` 的事件列表 |
| 触发器 | 作为 `事件处理` 内的触发规则 Tab |
| 死信队列 | 作为 `事件处理` 内的死信队列 Tab |

页面建议：

```text
事件处理
├── 事件列表
├── 触发规则
├── 死信队列
└── 事件详情
    ├── 事件内容
    ├── 消费记录
    ├── 关联流程
    ├── 错误信息
    └── 处理操作
```

推荐路由关系：

```text
/ucp/events                 事件列表
/ucp/events/triggers        触发规则
/ucp/events/dead-letters    死信队列
/ucp/events/:id             事件详情
```

兼容现有路由建议：

```text
/ucp/triggers      可重定向到 /ucp/events/triggers
/ucp/dead-letters  可重定向到 /ucp/events/dead-letters
```

验收标准：

1. 左侧菜单只出现 `事件处理`。
2. 不再平铺展示 `事件中心`、`触发器`、`死信队列` 三个并列菜单。
3. 用户在一个模块内可以完成事件查看、触发规则维护、死信处理。
4. 死信处理必须能跳转到关联运行记录或关联流程。

---

#### 9.4.5 监控告警

菜单名称：

```text
监控告警
```

推荐路由：

```text
/ucp/monitor
```

职责范围：

1. 查看数据连接整体健康状态。
2. 查看系统维度监控指标。
3. 查看流程维度监控指标。
4. 查看失败率、耗时、吞吐量、延迟等指标。
5. 管理告警规则。
6. 管理通知模板。
7. 查看告警发送结果。

需要整合的现有能力：

| 原能力 | 调整方式 |
|---|---|
| 监控中心 | 改名为 `监控告警` |
| 通知模板 | 作为监控告警中的配置页或 Tab |
| 熔断配置 | 当前阶段可作为高级配置入口，不建议放到左侧主菜单 |

页面建议：

```text
监控告警
├── 监控看板
├── 系统健康
├── 流程质量
├── 告警规则
├── 通知模板
└── 告警记录
```

推荐路由关系：

```text
/ucp/monitor                  监控看板
/ucp/monitor/alerts           告警规则
/ucp/monitor/templates        通知模板
/ucp/monitor/records          告警记录
```

兼容现有路由建议：

```text
/ucp/notification-templates   可重定向到 /ucp/monitor/templates
/ucp/circuits                 可作为高级配置页，默认不出现在左侧菜单
```

验收标准：

1. 左侧菜单出现 `监控告警`。
2. 原 `监控中心` 文案不再作为当前阶段主菜单名称。
3. 通知模板不作为独立左侧主菜单。
4. 监控告警中的指标必须能跳转到运行中心或事件处理中的明细。

---

#### 9.4.6 场景方案

菜单名称：

```text
场景方案
```

推荐路由：

```text
/ucp/scenarios
```

职责范围：

1. 承载基于数据连接平台包装出来的 HR 业务场景。
2. 降低业务管理员对底层系统、凭证、流程、事件的理解成本。
3. 以场景化方式呈现配置、运行、异常处理和业务结果。

当前阶段纳入的场景：

| 原菜单 | 调整方式 |
|---|---|
| OA 同步 | 放入 `场景方案` |
| 外部账号 | 放入 `场景方案` |
| 审批中心 | 如与场景强相关，可放入对应场景详情中；如为通用审批，可后续进入治理中心 |

页面建议：

```text
场景方案
├── 方案列表
├── OA 组织同步
│   ├── 配置概览
│   ├── 同步范围
│   ├── 最近运行
│   ├── 异常处理
│   └── 业务结果
├── 外部账号生命周期
│   ├── 配置概览
│   ├── 账号范围
│   ├── 开通规则
│   ├── 回收规则
│   ├── 最近运行
│   └── 异常处理
└── 方案详情
```

推荐路由关系：

```text
/ucp/scenarios                       方案列表
/ucp/scenarios/oa-sync               OA 组织同步
/ucp/scenarios/external-accounts     外部账号生命周期
```

兼容现有路由建议：

```text
/ucp/oa-sync             可重定向到 /ucp/scenarios/oa-sync
/ucp/external-accounts   可重定向到 /ucp/scenarios/external-accounts
/ucp/approvals           可根据实际职责放入场景详情或后续治理中心
```

验收标准：

1. 左侧菜单出现 `场景方案`。
2. `OA 同步`、`外部账号` 不再作为左侧平铺主菜单。
3. 业务用户可以从场景方案直接进入业务配置和运行结果，不需要先理解底层流程编排。
4. 场景详情中应提供跳转到底层流程、运行记录和异常事件的链接。

---


#### 9.4.7 资产治理

菜单名称：

```text
资产治理
```

推荐路由：

```text
/ucp/assets
```

职责范围：

1. 承载代码中已实现的集成资产目录与数据治理能力。
2. 为平台管理员、集成管理员提供资产盘点、治理任务、质量规则、冲突处理等入口。
3. 避免 `资产目录` 与 `数据治理` 两个能力继续作为分散菜单平铺，同时避免已实现功能被隐藏造成可用性回退。

需要整合的现有入口：

| 原菜单 / 能力 | 调整方式 |
|---|---|
| 资产目录 | 合并为 `资产治理` 的资产目录默认页 |
| 数据治理 | 合并为 `资产治理` 的治理任务或治理总览 Tab |
| 依赖拓扑 | 作为资产治理内的隐藏子路由或详情分析页 |
| SLA 管理 | 作为资产治理内的 SLA 配置页 |
| 变更管理 | 作为资产治理内的变更页 |
| 主数据治理 | 作为资产治理内的主数据页 |
| 数据质量 | 作为资产治理内的质量规则页 |
| 冲突处理 | 作为资产治理内的冲突工作台 |

页面建议：

```text
资产治理
├── 资产目录
├── 治理任务
├── 主数据治理
├── 数据质量
├── 冲突处理
├── 依赖拓扑
├── SLA 管理
└── 变更管理
```

推荐路由关系：

```text
/ucp/assets          资产治理默认页 / 资产目录
/ucp/governance      治理任务
/ucp/master-data     主数据治理
/ucp/quality         数据质量
/ucp/conflicts       冲突处理
/ucp/topology        依赖拓扑
/ucp/sla             SLA 管理
/ucp/changes         变更管理
```

实施要求：

1. 左侧主菜单展示 `资产治理`，不再分别平铺 `资产目录`、`数据治理` 两个主菜单。
2. `资产治理` 默认进入 `/ucp/assets`，页面标题可显示为 `资产治理`，默认 Tab 为 `资产目录`。
3. `/ucp/governance`、`/ucp/master-data`、`/ucp/quality`、`/ucp/conflicts` 等已实现页面必须可从 `资产治理` 页面内部进入。
4. 如暂时不改造页面结构，也至少应在 `资产治理` 页面提供卡片式入口，跳转到已实现的治理相关页面。
5. `ucp.assets` 与 `ucp.governance` 权限继续保留；只拥有其中一个权限的用户，也应能看到 `资产治理` 菜单，但只能访问有权限的页签或卡片。

验收标准：

1. 左侧菜单出现四字菜单 `资产治理`。
2. 已实现的资产目录能力可从 `资产治理` 进入。
3. 已实现的数据治理能力可从 `资产治理` 进入。
4. `资产目录`、`数据治理` 不作为两个并列主菜单平铺，避免主导航膨胀。
5. 子路由进入时左侧高亮 `资产治理`。
6. 无权限的治理子能力不展示入口或点击时明确提示无权限。

---
### 9.5 当前菜单与目标菜单映射

| 当前菜单 / 能力 | 目标位置 | 是否左侧主菜单 | 处理要求 |
|---|---|---:|---|
| 数据连接 Tab | 数据连接 Tab | 是，顶部 Tab | 点击后进入 `/ucp` 概览页 |
| 概览 | 顶部 Tab 默认页 | 否 | 不出现在左侧菜单 |
| 接入系统 | 接入系统 | 是 | 建议路由 `/ucp/systems` |
| 资源管理 | 接入系统详情 / 资源接口 | 否 | 不再指向 `/ucp` |
| 凭证管理 | 接入系统详情 / 认证凭证 | 否 | 不再作为主菜单 |
| 流水线管理 | 流程编排 | 是 | 菜单改名为四字 `流程编排` |
| 流水线画布 | 流程编排的新建 / 编辑页 | 否 | 不作为主菜单 |
| 执行日志 | 运行中心 | 是 | 菜单改名为四字 `运行中心` |
| 事件中心 | 事件处理 / 事件列表 | 是 | 合并到 `事件处理` |
| 触发器 | 事件处理 / 触发规则 | 否 | 不作为主菜单 |
| 死信队列 | 事件处理 / 死信队列 | 否 | 不作为主菜单 |
| 监控中心 | 监控告警 | 是 | 菜单改名为四字 `监控告警` |
| 通知模板 | 监控告警 / 通知模板 | 否 | 不作为主菜单 |
| 熔断配置 | 监控告警 / 高级配置 | 否 | 默认不出现在左侧菜单 |
| OA 同步 | 场景方案 / OA 组织同步 | 是，归属场景方案 | 不再平铺主菜单 |
| 外部账号 | 场景方案 / 外部账号生命周期 | 是，归属场景方案 | 不再平铺主菜单 |
| 审批中心 | 场景方案或远期治理中心 | 视实际职责 | 当前不建议平铺 |
| 集成资产 | 资产治理 / 资产目录 | 是，归属资产治理 | 已实现，当前阶段应展示 |
| 资产目录 | 资产治理 / 资产目录 | 是，归属资产治理 | 已实现，当前阶段应展示 |
| 依赖拓扑 | 远期治理中心 | 否 | 当前阶段不展示 |
| SLA 管理 | 远期治理中心 | 否 | 当前阶段不展示 |
| 变更管理 | 远期治理中心 | 否 | 当前阶段不展示 |
| 主数据治理 | 资产治理 / 主数据治理 | 否，作为资产治理内页 | 已实现可作为资产治理二级 Tab 或隐藏子路由 |
| 数据质量 | 资产治理 / 数据质量 | 否，作为资产治理内页 | 已实现可作为资产治理二级 Tab 或隐藏子路由 |
| 冲突处理 | 资产治理 / 冲突处理 | 否，作为资产治理内页 | 已实现可作为资产治理二级 Tab 或隐藏子路由 |
| 管理后台 | 不作为当前主菜单 | 否 | 不允许继续指向 `/ucp` |

---

### 9.6 路由调整要求

#### 9.6.1 推荐目标路由

> **标注说明**：`[已有]` 表示当前代码中已存在该路由；`[新建]` 表示当前不存在，需新增路由和页面组件；`[改名]` 表示路由语义不变但路径调整；`[重构]` 表示当前 `/ucp` 的 `DataAccessIndex.vue` 被拆解，页内 Tab 内容独立为路由。

```text
/ucp                              数据连接概览页，顶部 Tab 默认页    [重构] 当前为 DataAccessIndex.vue Tab 页，需改为概览 Dashboard
/ucp/systems                      接入系统                          [新建] 系统列表需从 DataAccessIndex 的 SystemsTabView 独立
/ucp/systems/:id                  接入系统详情                      [新建]
/ucp/pipelines                    流程编排                          [已有] 当前 /ucp/pipelines (PipelineListView)
/ucp/pipelines/create             新建流程画布                      [已有] 当前 /ucp/pipeline-designer
/ucp/pipelines/:id                流程详情                          [新建]
/ucp/pipelines/:id/edit           编辑流程画布                      [已有] 当前 /ucp/pipeline-designer/:templateCode
/ucp/runs                         运行中心                          [改名] 当前 /ucp/executions (PipelineExecList)
/ucp/runs/:id                     运行详情                          [改名] 当前 /ucp/executions/:id (PipelineExecDetail)
/ucp/events                       事件处理                          [已有] 当前 /ucp/events (EventListView)
/ucp/events/triggers              触发规则                          [新建] 当前在 EventsTabView 内嵌 Tab 或 /ucp/triggers 独立路由
/ucp/events/dead-letters          死信队列                          [新建] 当前在 EventsTabView 内嵌 Tab 或 /ucp/dead-letters 独立路由
/ucp/events/:id                   事件详情                          [已有] 当前 /ucp/events/:eventId
/ucp/monitor                      监控告警                          [已有] 当前 /ucp/monitor (MonitorDashboardView)
/ucp/monitor/alerts               告警规则                          [已有] 当前已实现 AlertRules CRUD 接口
/ucp/monitor/templates            通知模板                          [已有] 当前 /ucp/notification-templates (隐藏路由)
/ucp/monitor/records              告警记录                          [已有] 当前已实现 AlertLog 接口
/ucp/scenarios                    场景方案                          [新建] 聚合 OA 同步和外部账号的卡片入口页
/ucp/scenarios/oa-sync            OA 组织同步                      [改名] 当前 /ucp/oa-sync 独立路由
/ucp/scenarios/external-accounts  外部账号生命周期                  [改名] 当前 /ucp/external-accounts 独立路由
/ucp/assets                       资产治理 / 资产目录               [已有] 当前 /ucp/assets (AssetCatalogView)
/ucp/governance                   资产治理 / 治理任务               [已有] 当前 /ucp/governance (隐藏路由)
/ucp/master-data                  资产治理 / 主数据治理             [已有] 当前 /ucp/master-data (隐藏路由)
/ucp/quality                      资产治理 / 数据质量               [已有] 当前 /ucp/quality (隐藏路由)
/ucp/conflicts                    资产治理 / 冲突处理               [已有] 当前 /ucp/conflicts (隐藏路由)
```

#### 9.6.2 兼容路由处理

为避免已有链接失效，可保留旧路由并增加重定向：

```text
/ucp/executions           -> /ucp/runs
/ucp/triggers             -> /ucp/events/triggers
/ucp/dead-letters         -> /ucp/events/dead-letters
/ucp/notification-templates -> /ucp/monitor/templates
/ucp/oa-sync              -> /ucp/scenarios/oa-sync
/ucp/external-accounts    -> /ucp/scenarios/external-accounts
```

以下路由可以保留为隐藏路由或详情页路由，但不得作为当前阶段左侧主菜单：

```text
/ucp/credentials
/ucp/adapter-registry
/ucp/api-templates
/ucp/circuits
/ucp/assets
/ucp/topology
/ucp/sla
/ucp/changes
/ucp/master-data
/ucp/diff
/ucp/quality
/ucp/conflicts
/ucp/governance
```

验收标准：

1. `/ucp` 只能表达数据连接概览，不再表达接入系统列表、资源管理或管理后台。
2. 任一左侧菜单都必须有唯一、明确的目标页面。
3. 不允许多个可见菜单同时跳转到同一个页面但表达不同语义。
4. 旧路由如需保留，必须重定向到新语义路由或作为隐藏详情页存在。

#### 9.6.3 后端 API 路由不受影响

**本次导航调整仅涉及前端 Vue Router 和左侧菜单，后端 API 路径不需要任何变更。**

说明：

1. 后端 API 仍然挂载在 `/ucp` 前缀下（`APIRouter(prefix="/ucp")`），与前端 `/ucp` 概览页不冲突。
2. `/ucp/systems`（前端页面）与 `GET /ucp/systems`（后端 API）路径相同但请求方式不同（页面请求 vs API 请求），Vue Router 和 API 请求走不同通道。
3. `/ucp/executions`（前端旧路由）改为 `/ucp/runs`，但后端 `GET /ucp/executions` 保持不变——前端新页面通过 `ucp.ts` 中的 API 函数继续调用同一后端端点。
4. 所有 `require_op("ucp.*")` 的后端权限检查不受影响。

**前端路由 ↔ 后端 API 对照（关键路径）：**

| 前端页面路由（调整后） | 后端 API（不变） |
|---|---|
| `/ucp` (概览 Dashboard) | `GET /ucp/monitor/summary` 等聚合接口 |
| `/ucp/systems` (系统列表页) | `GET /ucp/systems` (已有) |
| `/ucp/runs` (运行中心) | `GET /ucp/executions` (已有) |
| `/ucp/runs/:id` (运行详情) | `GET /ucp/executions/{pipeline_run_id}` (已有) |
| `/ucp/scenarios` (场景方案首页) | `GET /ucp/oa-sync/runs` / `GET /ucp/external-accounts` (已有) |
| `/ucp/events/triggers` (触发规则) | `GET /ucp/triggers` (已有) |
| `/ucp/events/dead-letters` (死信队列) | `GET /ucp/dead-letters` (已有) |
| `/ucp/monitor/templates` (通知模板) | `GET /ucp/notification-templates` (已有) |

#### 9.6.4 DataAccessIndex.vue 拆解影响说明

当前 `/ucp` 由 `DataAccessIndex.vue` 承载，其内部 `el-tabs` 聚合了 4 个子视图（接入系统 / 事件中心 / 流水线 / 监控中心），并支持 `?system=CODE` 的系统筛选上下文。本次调整将产生以下变化：

**拆解前：**
```text
/ucp (DataAccessIndex.vue)
  └── el-tabs
      ├── 接入系统 (SystemsTabView)
      ├── 事件中心 (EventsTabView)
      ├── 流水线   (PipelinesTabView)
      └── 监控中心 (MonitorTabView)
```

**拆解后：**
```text
/ucp               → 新建概览 Dashboard 页（替代 DataAccessIndex.vue）
/ucp/systems       → SystemsTabView 独立为页面，或新建系统列表页
/ucp/pipelines     → PipelineListView 承载（已有路由，不受影响）
/ucp/events        → EventListView 或 EventsTabView 独立
/ucp/monitor       → MonitorDashboardView 承载（已有路由，不受影响）
```

**关键影响：**

1. `DataAccessIndex.vue` 将被废弃或缩减为纯路由容器。
2. `SystemsTabView` 的 `?system=` 上下文筛选机制需要改为路由参数或 query 参数传递。
3. `EventsTabView`、`PipelinesTabView`、`MonitorTabView` 目前依赖 `DataAccessIndex.vue` 提供的 props（`currentSystemCode`、`changeSystem` 等），独立为路由后需自行从 route query 中读取系统上下文。
4. 这是整个导航调整中**工作量最大的单项改动**，建议作为 P0 的第一项开始。

---

### 9.7 菜单权限调整要求

权限命名空间继续使用：

```text
ucp.*
```

推荐权限与菜单关系：

| 可见菜单 | 推荐主权限 | 可关联的操作权限 |
|---|---|---|
| 接入系统 | `ucp.systems` | `ucp.resources`、`ucp.credentials` |
| 流程编排 | `ucp.pipelines` | `ucp.pipeline_designer` |
| 运行中心 | `ucp.executions` | 运行详情、重试、导出等权限 |
| 事件处理 | `ucp.events` | `ucp.triggers`、`ucp.dead_letters` |
| 监控告警 | `ucp.monitor` | 通知模板、告警规则、熔断配置 |
| 场景方案 | `ucp.scenarios` | `ucp.oa_sync`、`ucp.external_accounts`、`ucp.approvals` |
| 资产治理 | `ucp.assets` 或 `ucp.governance` | 资产标签、治理任务、主数据、质量规则、冲突处理、SLA、变更 |

**权限 code 现状与调整：**

| 权限 code | 当前状态 | 对应菜单 | 调整要求 |
|---|---|---|---|
| `ucp.systems` | 已有，seed 中为叶子菜单 | 接入系统 | 保留，作为接入系统主权限 |
| `ucp.resources` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到接入系统详情页内使用 |
| `ucp.credentials` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到接入系统详情页内使用 |
| `ucp.pipelines` | 已有，seed 中为叶子菜单 | 流程编排 | 保留 |
| `ucp.pipeline_designer` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，画布编辑能力控制 |
| `ucp.executions` | 已有，seed 中为叶子菜单 | 运行中心 | 保留 |
| `ucp.events` | 已有，seed 中为叶子菜单 | 事件处理 | 保留 |
| `ucp.triggers` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到事件处理内 |
| `ucp.dead_letters` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到事件处理内 |
| `ucp.monitor` | 已有，seed 中为叶子菜单 | 监控告警 | 保留 |
| `ucp.admin` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，隐藏路由 |
| `ucp.approvals` | 已有，seed 中为叶子菜单 | 暂不定 | 保留 |
| `ucp.external_accounts` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到场景方案内 |
| `ucp.oa_sync` | 已有，seed 中为叶子菜单 | 无独立菜单 | 保留，下沉到场景方案内 |
| `ucp.assets` | 已有，seed 中为叶子菜单 | 资产治理 | 保留 |
| `ucp.governance` | 已有，seed 中为叶子菜单 | 资产治理（Tab） | 保留 |
| **`ucp.scenarios`** | **不存在** | 场景方案 | **需新增** — seed 中新增叶子菜单、前端 `menuRoutes.ts` 中新增映射 |

`ucp.scenarios` 短期替代方案：如果暂不新增该权限，可由 `ucp.oa_sync` 或 `ucp.external_accounts` 任一授权时显示 `场景方案` 菜单。但长期强烈建议补齐 `ucp.scenarios`。

验收标准：

1. 权限点可以多于菜单项，但菜单项不应机械等同于权限点。
2. 隐藏页面仍必须受权限控制。
3. 用户无某项操作权限时，可以看到菜单但不能执行对应操作，或根据角色策略隐藏对应 Tab / 按钮。
4. 菜单高亮应基于目标菜单归属，而不是仅基于路径字符串。
5. `ucp.scenarios` 需在 seed `MENU_TREE` 中新增叶子节点，前端 `menuRoutes.ts` 中新增 `'ucp.scenarios': '/ucp/scenarios'`。

---

### 9.8 前端导航配置调整要求

涉及文件包括但不限于：

```text
hr-portal/frontend/src/constants/menuRoutes.ts
hr-portal/frontend/src/router/index.ts
hr-portal/frontend/src/layouts/Default.vue
```

调整要求：

1. `menuRoutes.ts` 中移除或修正多个菜单 code 指向 `/ucp` 的配置（当前 `ucp.systems`、`ucp.resources`、`ucp.admin` 均指向 `/ucp`）。
2. 顶部 `数据连接` Tab 的默认路由配置为 `/ucp`。
3. `/ucp` 对应概览页面，路由 meta 中应能表达其归属为 `数据连接`。
4. 左侧菜单仅显示 7 个四字入口：

```text
接入系统
流程编排
运行中心
事件处理
监控告警
场景方案
资产治理
```

5. 对于被下沉的功能，不在左侧菜单中展示，但可以保留路由、按钮入口、详情页 Tab 或重定向。
6. 左侧菜单高亮规则需要覆盖子路由，例如：

```text
/ucp/pipelines/create      高亮 流程编排
/ucp/pipelines/:id/edit    高亮 流程编排
/ucp/runs/:id              高亮 运行中心
/ucp/events/triggers       高亮 事件处理
/ucp/events/dead-letters   高亮 事件处理
/ucp/monitor/templates     高亮 监控告警
/ucp/scenarios/oa-sync     高亮 场景方案
/ucp/governance            高亮 资产治理
/ucp/master-data           高亮 资产治理
```

7. **菜单高亮机制变更**：当前 `Default.vue` 的左侧菜单高亮基于 `leaf.code` 与 `route.meta.menuCode` 的**精确匹配**。子路由（如 `/ucp/pipelines/create`）的 `menuCode` 与父菜单相同（`ucp.pipelines`）时，精确匹配已经生效。但部分路由（如 `/ucp/governance`）的 `menuCode` 是 `ucp.governance`，需要在高亮逻辑中增加 **父菜单映射**，使 `ucp.governance` 能高亮 `资产治理` 菜单。

   推荐的实现方式（二选一）：
   - **方案 A（推荐）**：在 `menuRoutes.ts` 或 `Default.vue` 中增加 `MENU_PARENT_MAP`，将子权限 code 映射到父菜单 code。例如 `{ 'ucp.governance': 'ucp.assets' }`，高亮时通过映射表查找。
   - **方案 B**：在 `Default.vue` 的高亮逻辑中增加路径前缀匹配，当 `menuCode` 匹配不上时 fallback 到路径前缀匹配。实现更简单但约定性较弱。

8. 当前 `menuRoutes.ts` 中 `ucp.systems`、`ucp.resources`、`ucp.admin` 三条映射均指向 `/ucp`，必须改为：
   - `'ucp.systems': '/ucp/systems'`（新建路由）
   - `'ucp.resources': '/ucp/systems'`（资源无独立页面，跟随接入系统）
   - `'ucp.admin': '/ucp'`（平台配置隐藏，或指向 `/ucp` 概览页的管理卡片）

验收标准：

1. 顶部 Tab、左侧菜单、页面标题、面包屑语义一致。
2. 点击顶部 `数据连接` 后进入概览页，左侧不选中“概览”菜单。
3. 进入任一子路由时，左侧能正确高亮所属主菜单。
4. 不出现同一路由被多个可见菜单重复使用的情况。
5. 前端构建必须通过。

---

### 9.9 概览页内容要求

`/ucp` 概览页需要承载数据连接模块的整体态势，不作为配置入口的堆叠页。

建议展示内容：

```text
数据连接概览
├── 核心指标
│   ├── 接入系统数
│   ├── 活跃流程数
│   ├── 今日运行次数
│   ├── 今日失败次数
│   ├── 待处理死信数
│   └── 当前告警数
├── 健康状态
│   ├── 系统健康分布
│   ├── 流程成功率
│   ├── 最近失败趋势
│   └── 平均执行耗时
├── 待办事项
│   ├── 待处理死信
│   ├── 待审批事项
│   ├── 即将过期凭证
│   └── 异常告警
├── 快捷入口
│   ├── 新建接入系统
│   ├── 新建流程编排
│   ├── 查看运行中心
│   └── 查看场景方案
└── 最近动态
    ├── 最近运行记录
    ├── 最近失败事件
    └── 最近配置变更
```

验收标准：

1. 概览页数据必须来自真实后端接口或明确的聚合接口，不允许长期使用静态 mock。
2. 概览页中的卡片必须能跳转到对应模块。
3. 概览页不承担接入系统列表页职责。
4. 概览页不展示过多低频技术配置入口。

---

### 9.10 实施优先级

#### P0 必须完成

1. `/ucp` 调整为数据连接概览页。
2. 顶部 `数据连接` Tab 点击后进入 `/ucp`。
3. 左侧菜单不展示概览入口。
4. 左侧菜单改为 7 个四字入口：

```text
接入系统
流程编排
运行中心
事件处理
监控告警
场景方案
```

5. 消除 `接入系统`、`资源管理`、`管理后台` 同时指向 `/ucp` 的问题。
6. 合并 `流水线管理` 与 `流水线画布`，画布不作为左侧菜单。
7. 合并 `事件中心`、`触发器`、`死信队列` 到 `事件处理`。
8. 将 `OA 同步`、`外部账号` 移入 `场景方案`。

#### P1 强烈建议完成

1. 新增或调整 `/ucp/systems` 作为接入系统列表页。
2. 新增或调整 `/ucp/runs` 作为运行中心主路由。
3. 新增或调整 `/ucp/scenarios` 作为场景方案主路由。
4. 对旧路由增加重定向，避免历史链接失效。
5. 完善面包屑和菜单高亮规则。
6. 将资源、凭证下沉到接入系统详情页。
7. 将通知模板下沉到监控告警配置页。

#### P2 后续优化

1. 按角色控制菜单和操作按钮。
2. 增加概览页聚合接口。
3. 将未成熟治理能力灰度隐藏；已完成的资产目录和数据治理应通过 `资产治理` 入口可达。
4. 建立菜单配置与权限配置的自动化检查。
5. 增加导航 E2E 用例，覆盖顶部 Tab、左侧菜单、子路由高亮和旧路由重定向。

---

### 9.11 导航调整验收清单

验收时必须逐项确认：

1. 顶部存在 `数据连接` Tab。
2. 点击 `数据连接` 进入 `/ucp`。
3. `/ucp` 展示数据连接概览页。
4. 左侧菜单不出现概览类菜单。
5. 左侧菜单名称全部为四个字。
6. 左侧菜单仅包含当前阶段 7 个主入口。
7. `接入系统` 不与 `资源管理`、`管理后台` 共用 `/ucp`。
8. `流程编排` 可进入列表、新建和编辑画布。
9. `流水线画布` 不作为左侧菜单。
10. `运行中心` 可查看运行记录和运行详情。
11. `事件处理` 可查看事件、触发规则和死信队列。
12. `触发器` 不作为左侧主菜单。
13. `死信队列` 不作为左侧主菜单。
14. `监控告警` 可查看监控看板、告警规则和通知模板。
15. `通知模板` 不作为左侧主菜单。
16. `场景方案` 可进入 OA 组织同步和外部账号生命周期。
17. `OA 同步` 不作为左侧平铺主菜单。
18. `外部账号` 不作为左侧平铺主菜单。
19. 子路由能正确高亮所属左侧主菜单。
20. 面包屑、页面标题、菜单名称语义一致。
21. 旧路由有重定向或隐藏路由承载方案。
22. 前端构建通过。
23. Docker 前端重新发布后页面表现与本方案一致。

---

## 10. 远期规划菜单示意图

远期平台化阶段可扩展为以下菜单结构，仅作为规划示意，当前阶段不要求全部实现或展示：

```text
数据连接
├── 接入系统
├── 流程编排
├── 运行中心
├── 事件处理
├── 监控告警
├── 场景方案
└── 治理中心
    ├── 集成资产
    ├── 依赖拓扑
    ├── SLA 管理
    ├── 变更管理
    ├── 主数据治理
    ├── 数据质量
    └── 冲突处理
```



---

## 11. 数据连接导航 UI 示意图与页面布局规范

> 本章用于补足导航调整的 UI 落地细节。后续开发必须同时参考第 9 章的信息架构和本章 UI 示意，确保不同开发人员可以按同一标准实现。

### 11.1 全局布局示意

点击顶部一级 Tab `数据连接` 后，默认进入 `/ucp` 概览页。左侧菜单不出现“概览”。

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 顶部一级导航                                                                 │
│ 首页 | 组织人事 | 招聘管理 | 数据仓库 | 数据连接[选中] | 系统设置             │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ 数据连接侧栏   │ 页面内容区                                                   │
│               │                                                              │
│ 接入系统       │ 面包屑：数据连接 / 概览                                      │
│ 流程编排       │ 标题：数据连接概览                                           │
│ 运行中心       │                                                              │
│ 事件处理       │ [核心指标卡片区]                                             │
│ 监控告警       │ [健康状态区]                                                 │
│ 场景方案       │ [待办事项区]                                                 │
│ 资产治理       │ [快捷入口区]                                                 │
│               │ [最近动态区]                                                 │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

全局要求：

1. 顶部 `数据连接` 为一级模块入口。
2. `/ucp` 是概览页，不是左侧菜单项。
3. 左侧菜单固定展示 7 个四字入口：

```text
接入系统
流程编排
运行中心
事件处理
监控告警
场景方案
资产治理
```

4. 左侧菜单宽度建议 200px-220px。
5. 页面内容区最小宽度需兼容 1366px 屏幕。
6. 所有二级能力优先通过页面内 Tab、卡片、按钮或详情页承载，不继续扩张左侧主菜单。

---

### 11.2 概览页 UI 示意

路由：

```text
/ucp
```

页面用途：展示数据连接整体态势和高频入口。

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 概览                                                       │
│ 标题：数据连接概览                                      [刷新] [时间范围▼]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ 核心指标                                                                     │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│ │ 接入系统数  │ │ 活跃流程数  │ │ 今日运行数  │ │ 今日失败数  │ │ 当前告警数  │   │
│ │ 12         │ │ 38         │ │ 1,286      │ │ 17         │ │ 5          │   │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
├──────────────────────────────────────────────────────────────────────────────┤
│ 左：健康状态                                      右：待办事项                │
│ ┌────────────────────────────────────────────┐ ┌──────────────────────────┐ │
│ │ 系统健康分布 / 成功率趋势 / 失败趋势图       │ │ 待处理死信  8   [查看]    │ │
│ │                                            │ │ 即将过期凭证 3 [查看]    │ │
│ │                                            │ │ 待审批事项  2   [查看]    │ │
│ └────────────────────────────────────────────┘ └──────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ 快捷入口                                                                     │
│ [新建接入系统] [新建流程编排] [查看运行中心] [查看场景方案] [进入资产治理]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ 最近动态                                                                     │
│ ┌──────────────────────────────┐ ┌─────────────────────────────────────────┐ │
│ │ 最近运行记录                  │ │ 最近失败事件                             │ │
│ │ 流程名称 | 状态 | 时间 | 查看  │ │ 事件类型 | 错误摘要 | 时间 | 处理         │ │
│ └──────────────────────────────┘ └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

交互要求：

1. 点击指标卡片应跳转到对应模块并自动带筛选条件。
2. 点击 `待处理死信` 跳转到 `/ucp/events/dead-letters`。
3. 点击 `即将过期凭证` 跳转到接入系统或凭证过滤页。
4. 点击 `进入资产治理` 跳转到 `/ucp/assets`。
5. 概览页不展示低频管理配置表单。

---

### 11.3 接入系统 UI 示意

路由：

```text
/ucp/systems
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 接入系统                                                   │
│ 标题：接入系统                                      [新建系统] [导入] [刷新]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选区                                                                       │
│ 系统名称/编码 [____________]  系统类型[▼]  状态[▼]  负责人[▼]  [查询] [重置] │
├──────────────────────────────────────────────────────────────────────────────┤
│ 系统列表                                                                     │
│ ┌──────┬────────┬────────┬────────┬────────┬────────┬────────┬──────────┐   │
│ │编码  │系统名称 │系统类型 │状态    │资源数  │凭证数  │负责人  │操作       │   │
│ ├──────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤   │
│ │feishu│飞书    │OA      │启用    │8       │2       │张三    │详情/测试   │   │
│ └──────┴────────┴────────┴────────┴────────┴────────┴────────┴──────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

系统详情页：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 接入系统 / 飞书                                            │
│ 标题：飞书                                              [测试连接] [编辑]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：基础信息 | 资源接口 | 认证凭证 | 调用配置 | 健康状态                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ 当前 Tab 内容区                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

实现要求：

1. `资源接口` 和 `认证凭证` 必须从系统详情页进入。
2. 不再单独提供左侧主菜单 `资源管理`、`凭证管理`。
3. 子页仍需保持左侧 `接入系统` 高亮。

---

### 11.4 流程编排 UI 示意

路由：

```text
/ucp/pipelines
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 流程编排                                                   │
│ 标题：流程编排                                      [新建流程] [模板创建]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选区                                                                       │
│ 流程名称 [________]  接入系统[▼]  状态[▼]  触发方式[▼]  [查询] [重置]        │
├──────────────────────────────────────────────────────────────────────────────┤
│ 流程列表                                                                     │
│ ┌──────┬────────┬────────┬────────┬──────────┬──────────┬──────────────┐   │
│ │编码  │流程名称 │来源系统 │目标系统 │状态      │最近运行   │操作           │   │
│ ├──────┼────────┼────────┼────────┼──────────┼──────────┼──────────────┤   │
│ │p001  │员工同步 │HRIS    │飞书    │启用      │成功       │编辑/试运行/详情 │   │
│ └──────┴────────┴────────┴────────┴──────────┴──────────┴──────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

画布编辑页：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 流程编排 / 编辑流程                                        │
│ 标题：员工同步流程                         [保存草稿] [试运行] [发布] [返回] │
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ 节点组件面板   │ 画布区                                        │ 属性配置面板   │
│               │                                               │               │
│ 数据读取       │  [读取员工] ──> [字段映射] ──> [写入飞书]       │ 节点名称       │
│ 字段映射       │                                               │ 系统选择       │
│ 条件判断       │                                               │ 资源选择       │
│ 数据写入       │                                               │ 凭证选择       │
│ 通知节点       │                                               │ 参数配置       │
└───────────────┴──────────────────────────────────────────────┴───────────────┘
```

实现要求：

1. `流水线画布` 不作为左侧菜单。
2. 从 `新建流程`、`编辑` 进入画布页面。
3. 画布页面左侧仍高亮 `流程编排`。

---

### 11.5 运行中心 UI 示意

路由：

```text
/ucp/runs
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 运行中心                                                   │
│ 标题：运行中心                                      [刷新] [导出]             │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选区                                                                       │
│ 流程[▼] 系统[▼] 状态[▼] 时间范围[________] Trace ID[____] [查询] [重置]       │
├──────────────────────────────────────────────────────────────────────────────┤
│ 运行记录                                                                     │
│ ┌────────┬────────┬────────┬────────┬────────┬────────┬──────────────┐     │
│ │运行ID  │流程名称 │触发方式 │状态    │耗时    │开始时间 │操作           │     │
│ ├────────┼────────┼────────┼────────┼────────┼────────┼──────────────┤     │
│ │run001  │员工同步 │事件触发 │失败    │12s     │10:21   │详情/重试       │     │
│ └────────┴────────┴────────┴────────┴────────┴────────┴──────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
```

运行详情页：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 运行中心 / run001                                          │
│ 标题：运行详情 run001                                  [重试失败项] [返回]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：基础信息 | 步骤明细 | 输入输出 | 失败明细 | 通知结果 | Trace 信息        │
├──────────────────────────────────────────────────────────────────────────────┤
│ 当前 Tab 内容区                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 11.6 事件处理 UI 示意

路由：

```text
/ucp/events
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 事件处理                                                   │
│ 标题：事件处理                                      [新建触发规则] [刷新]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：事件列表 | 触发规则 | 死信队列                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选区                                                                       │
│ 事件类型[▼] 来源系统[▼] 状态[▼] 时间范围[____] [查询] [重置]                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 当前 Tab 表格                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

死信队列 Tab：

```text
┌────────┬────────┬────────┬────────┬──────────┬──────────────┐
│事件ID  │来源系统 │事件类型 │失败原因 │失败时间   │操作           │
├────────┼────────┼────────┼────────┼──────────┼──────────────┤
│evt001  │飞书    │员工变更 │字段缺失 │10:30     │详情/重放/忽略  │
└────────┴────────┴────────┴────────┴──────────┴──────────────┘
```

实现要求：

1. `事件中心`、`触发器`、`死信队列` 不作为三个左侧主菜单。
2. 进入 `/ucp/events/triggers` 或 `/ucp/events/dead-letters` 时仍高亮 `事件处理`。

---

### 11.7 监控告警 UI 示意

路由：

```text
/ucp/monitor
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 监控告警                                                   │
│ 标题：监控告警                                      [刷新] [告警配置]         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：监控看板 | 系统健康 | 流程质量 | 告警规则 | 通知模板 | 告警记录          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 指标卡片                                                                     │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│ │成功率      │ │平均耗时    │ │失败率      │ │当前告警    │                 │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 趋势图 / 分布图 / Top 失败流程                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

实现要求：

1. `通知模板` 作为监控告警内页或 Tab，不作为左侧菜单。
2. 告警指标必须能跳转到 `运行中心` 或 `事件处理` 的明细。

---

### 11.8 场景方案 UI 示意

路由：

```text
/ucp/scenarios
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 场景方案                                                   │
│ 标题：场景方案                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ 方案卡片                                                                     │
│ ┌────────────────────────────┐ ┌────────────────────────────┐               │
│ │ OA 组织同步                 │ │ 外部账号生命周期             │               │
│ │ 同步组织、部门、员工数据      │ │ 账号开通、变更、回收          │               │
│ │ 最近运行：成功               │ │ 待处理异常：3                │               │
│ │ [进入方案] [查看运行]         │ │ [进入方案] [查看异常]         │               │
│ └────────────────────────────┘ └────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────────┘
```

方案详情页：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 场景方案 / OA 组织同步                                     │
│ 标题：OA 组织同步                                      [立即同步] [配置]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：配置概览 | 同步范围 | 最近运行 | 异常处理 | 业务结果                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 当前 Tab 内容区                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 11.9 资产治理 UI 示意

路由：

```text
/ucp/assets
```

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 面包屑：数据连接 / 资产治理                                                   │
│ 标题：资产治理                                      [刷新] [生成治理报告]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tab：资产目录 | 治理任务 | 主数据治理 | 数据质量 | 冲突处理 | 更多▼           │
│ 更多：依赖拓扑 / SLA 管理 / 变更管理                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 资产目录默认页                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│ │系统资产    │ │资源接口    │ │流程资产    │ │事件资产    │                 │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选区                                                                       │
│ 资产类型[▼] 业务域[▼] 负责人[▼] 状态[▼] 关键词[____] [查询] [重置]           │
├──────────────────────────────────────────────────────────────────────────────┤
│ 资产列表                                                                     │
│ ┌────────┬────────┬────────┬────────┬────────┬────────┬──────────────┐     │
│ │资产类型 │资产名称 │所属系统 │业务域  │负责人  │健康度  │操作           │     │
│ ├────────┼────────┼────────┼────────┼────────┼────────┼──────────────┤     │
│ │流程    │员工同步 │HRIS    │人力    │张三    │良好    │详情/拓扑/治理   │     │
│ └────────┴────────┴────────┴────────┴────────┴────────┴──────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
```

治理任务 Tab：

```text
┌────────┬────────┬────────┬────────┬────────┬────────┬──────────────┐
│任务ID  │任务类型 │关联资产 │优先级  │状态    │负责人  │操作           │
├────────┼────────┼────────┼────────┼────────┼────────┼──────────────┤
│gov001  │质量整改 │员工同步 │高      │处理中  │李四    │详情/更新状态   │
└────────┴────────┴────────┴────────┴────────┴────────┴──────────────┘
```

主数据治理 Tab：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 子 Tab：主数据对象 | ID 映射 | 映射冲突                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

数据质量 Tab：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [新建质量规则]                                                               │
│ 规则列表：规则名称 | 对象类型 | 规则类型 | 严重级别 | 状态 | 最近扫描 | 操作   │
└──────────────────────────────────────────────────────────────────────────────┘
```

冲突处理 Tab：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 冲突列表：冲突对象 | 来源 | 冲突类型 | 状态 | 发现时间 | 操作               │
└──────────────────────────────────────────────────────────────────────────────┘
```

实现要求：

1. 左侧只展示 `资产治理` 一个四字菜单。
2. `/ucp/assets` 默认打开资产目录。
3. `/ucp/governance`、`/ucp/master-data`、`/ucp/quality`、`/ucp/conflicts` 可实现为资产治理内部 Tab，也可短期保留独立路由并从 Tab 跳转。
4. 进入这些子路由时左侧菜单必须高亮 `资产治理`。
5. 如果用户没有 `ucp.governance` 权限，则不展示治理任务、主数据治理、数据质量、冲突处理入口。
6. 如果用户没有 `ucp.assets` 权限，则不展示资产目录入口。

---

### 11.10 左侧菜单高亮规则示意

```text
/ucp                                  顶部 Tab 数据连接选中，左侧不选中概览
/ucp/systems                          左侧高亮 接入系统
/ucp/systems/:id                      左侧高亮 接入系统
/ucp/pipelines                        左侧高亮 流程编排
/ucp/pipelines/create                 左侧高亮 流程编排
/ucp/pipelines/:id/edit               左侧高亮 流程编排
/ucp/runs                             左侧高亮 运行中心
/ucp/runs/:id                         左侧高亮 运行中心
/ucp/events                           左侧高亮 事件处理
/ucp/events/triggers                  左侧高亮 事件处理
/ucp/events/dead-letters              左侧高亮 事件处理
/ucp/monitor                          左侧高亮 监控告警
/ucp/monitor/templates                左侧高亮 监控告警
/ucp/scenarios                        左侧高亮 场景方案
/ucp/scenarios/oa-sync                左侧高亮 场景方案
/ucp/scenarios/external-accounts      左侧高亮 场景方案
/ucp/assets                           左侧高亮 资产治理
/ucp/governance                       左侧高亮 资产治理
/ucp/master-data                      左侧高亮 资产治理
/ucp/quality                          左侧高亮 资产治理
/ucp/conflicts                        左侧高亮 资产治理
/ucp/topology                         左侧高亮 资产治理
/ucp/sla                              左侧高亮 资产治理
/ucp/changes                          左侧高亮 资产治理
```

---

### 11.11 开发交付检查清单

开发完成后，必须按以下清单验收：

1. 顶部 `数据连接` Tab 点击进入 `/ucp`。
2. `/ucp` 页面展示概览 UI，不展示系统列表。
3. 左侧没有“概览”菜单。
4. 左侧菜单恰好为 7 个四字项。
5. 每个左侧菜单都有唯一页面语义。
6. 各子路由高亮规则符合 11.10。
7. 资源、凭证在接入系统详情页可达。
8. 画布从流程编排进入，不在左侧平铺。
9. 触发规则、死信队列从事件处理进入，不在左侧平铺。
10. 通知模板从监控告警进入，不在左侧平铺。
11. OA 同步、外部账号从场景方案进入，不在左侧平铺。
12. 资产目录、数据治理从资产治理进入，不被隐藏。
13. 页面标题、面包屑、菜单高亮一致。
14. 权限不足时隐藏对应操作或给出明确提示。
15. 前端构建通过。
16. Docker 前端重新发布后，浏览器强制刷新可看到最新导航。

---

## 12. 数据连接 UI 看板最终优化方案（必须按此开发）

> 本节为数据连接 UI 的最终落地方案，用于解决概览、接入系统、流程编排、事件处理、监控告警、资产治理等页面看板分散、指标重复、职责边界不清的问题。开发时以本节为准，不再按阶段拆分。

### 12.1 当前现状确认

根据当前产品描述与现有 UCP 页面结构，数据连接模块存在多处看板/KPI 分布：

| 页面 | 当前看板数量 | 当前问题 |
| --- | ---: | --- |
| 数据连接概览 | 6 | 承担了全局总览职责，但部分运行类、告警类指标容易与监控告警重复。 |
| 接入系统 | 6 | 同时展示系统配置、资源、凭证、同步状态、失败/告警等指标，职责偏重。 |
| 流程编排 | 5 | 流程定义类指标与运行结果类指标边界不清，触发类型类统计更适合作为筛选器。 |
| 事件处理 | 4 | 职责相对清晰，应聚焦事件接收、匹配、派发、死信。 |
| 监控告警 | 6 | 应作为运行质量、成功率、失败率、耗时、告警的唯一权威页面。 |
| 资产管理/资产治理 | 6 | 应聚焦资产、治理、质量，不应展示 24h 事件/运行等过程指标。 |

核心问题：

1. **指标所有权重复**：成功率、失败率、24h 同步/运行、告警、事件量等指标在多个页面重复出现。
2. **页面职责不够单一**：接入系统页面承载了配置、资源、凭证、运行状态、告警等多类职责；资产治理也容易混入运行过程指标。
3. **看板分散导致用户决策成本高**：用户需要在多个页面之间来回切换，才能判断“哪里异常、谁负责处理、下一步去哪”。
4. **指标缺少统一下钻规范**：看板只展示数字但未统一约定点击后的过滤条件、跳转页面、时间窗口和口径说明。

---

### 12.2 最终设计原则

所有开发必须遵守以下原则：

1. **一个指标只归属一个权威页面**
   - 运行成功率、失败率、平均耗时、告警数只归属 `监控告警`。
   - 事件总量、未匹配、死信只归属 `事件处理`。
   - 系统数量、资源数量、凭证风险、异常系统只归属 `接入系统`。
   - 流程定义数量、启用/禁用、最近失败流程只归属 `流程编排`。
   - 资产、治理任务、质量问题只归属 `资产治理`。
   - 概览只展示跨域摘要，不承接明细管理。

2. **概览页只回答“整体是否健康”**
   - `/ucp` 是全局驾驶舱，只展示关键摘要与风险入口。
   - 不展示系统列表、流程列表、事件列表、资产列表等明细表格。

3. **领域页面只回答“本领域怎么处理”**
   - 接入系统：配置、资源、凭证、系统健康。
   - 流程编排：流程定义、启停、编辑、最近失败入口。
   - 运行中心：执行实例、运行中、失败、重试。
   - 事件处理：事件匹配、派发、死信处理。
   - 监控告警：运行质量趋势、告警处理、通知模板。
   - 资产治理：资产目录、治理任务、主数据、质量、冲突。

4. **所有看板必须可点击下钻**
   - 每张 KPI 卡片必须配置 `targetRoute` 或明确标记为不可点击。
   - 点击后必须带上确定的过滤条件，例如 `status=failed`、`timeRange=24h`、`risk=credential_expiring`。
   - 卡片 tooltip 必须说明统计口径和时间窗口。

5. **同类指标口径必须统一**
   - 默认运行类统计窗口：`最近 24 小时`。
   - 默认配置类统计窗口：`当前实时快照`。
   - 默认治理/质量类统计窗口：`当前未关闭事项`。
   - 如使用其他口径，必须在 UI 中明确展示。

---

### 12.3 最终页面与看板归属

#### 12.3.1 数据连接概览 `/ucp`：6 个全局摘要看板

概览页保留 6 个卡片，只展示全局健康摘要，不承接具体领域的明细管理。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 接入系统 | 当前接入系统总数 | `/ucp/systems` |
| 2 | 活跃流程 | 当前启用中的流程数 | `/ucp/pipelines?status=enabled` |
| 3 | 24h 运行 | 最近 24 小时执行实例数 | `/ucp/runs?timeRange=24h` |
| 4 | 失败率 | 最近 24 小时失败率摘要 | `/ucp/monitor?metric=fail_rate&timeRange=24h` |
| 5 | 待处理死信 | 当前未处理死信事件数 | `/ucp/events/dead-letters?status=pending` |
| 6 | 当前告警 | 当前未关闭告警数 | `/ucp/monitor?status=open` |

设计要求：

- 概览页的失败率、当前告警只是摘要入口，详细趋势和处理动作必须在监控告警页完成。
- 概览页的待处理死信只是风险入口，死信列表和重放动作必须在事件处理页完成。
- 概览页不得再新增与单领域页面重复的明细表格。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 数据连接概览                                                                 │
│ 连接企业系统、编排数据流程、监控运行质量与治理数据资产                         │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ 接入系统      │ 活跃流程      │ 24h运行      │ 失败率        │ 待处理死信    │ 当前告警      │
│ 12           │ 28           │ 1,246        │ 2.1%         │ 7            │ 3            │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 运行健康趋势                  │ │ 风险待办                       │
│ 成功/失败趋势、耗时趋势         │ │ 死信、告警、凭证风险、质量问题   │
└──────────────────────────────┘ └──────────────────────────────┘
```

---

#### 12.3.2 接入系统 `/ucp/systems`：4 个系统配置看板

接入系统页从 6 个看板收敛为 4 个，只负责系统接入、资源接口、凭证风险和系统异常。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 接入系统 | 当前接入系统总数 | `/ucp/systems` |
| 2 | 数据资源 | 当前资源/API/数据表总数 | `/ucp/systems?tab=resources` 或系统详情资源 Tab |
| 3 | 凭证风险 | 即将过期、已过期、校验失败的凭证数 | `/ucp/systems?risk=credential` |
| 4 | 异常系统 | 连接测试失败、禁用、配置异常系统数 | `/ucp/systems?status=abnormal` |

必须移除或迁移：

- `24h 同步`、`同步成功率`、`失败率` 等运行结果指标迁移到 `监控告警` 或 `运行中心`。
- `当前告警` 迁移到 `监控告警`。
- 系统页可以展示单个系统的健康状态，但不做全局运行质量权威统计。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 接入系统                                      [新增系统] [测试连接] [导入配置] │
├────────────────┬────────────────┬────────────────┬────────────────────────┤
│ 接入系统        │ 数据资源        │ 凭证风险        │ 异常系统                │
│ 12             │ 86             │ 4              │ 2                       │
└────────────────┴────────────────┴────────────────┴────────────────────────┘
│ 筛选：系统类型 / 状态 / 负责人 / 凭证风险                                      │
│ 列表：系统名称 | 类型 | 连接状态 | 资源数 | 凭证状态 | 负责人 | 最近检测 | 操作 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

#### 12.3.3 流程编排 `/ucp/pipelines`：4 个流程定义看板

流程编排页从 5 个看板收敛为 4 个，只负责流程定义生命周期。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 流程总数 | 当前流程定义总数 | `/ucp/pipelines` |
| 2 | 启用流程 | 当前启用流程数 | `/ucp/pipelines?status=enabled` |
| 3 | 禁用流程 | 当前禁用流程数 | `/ucp/pipelines?status=disabled` |
| 4 | 最近失败流程 | 最近 24 小时有失败执行的流程数 | `/ucp/pipelines?recentRunStatus=failed&timeRange=24h` |

必须移除或改造：

- 触发类型、调度类型等统计不再作为 KPI 卡片展示，改为筛选器或分组标签。
- 执行次数、成功率、失败率不归属流程编排页；只允许在流程列表中作为辅助列或跳转入口展示。
- 画布入口保留在流程编排内部，不在左侧菜单平铺。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 流程编排                                      [新建流程] [打开画布] [导入流程] │
├────────────────┬────────────────┬────────────────┬────────────────────────┤
│ 流程总数        │ 启用流程        │ 禁用流程        │ 最近失败流程            │
│ 42             │ 31             │ 11             │ 5                       │
└────────────────┴────────────────┴────────────────┴────────────────────────┘
│ 筛选：状态 / 触发方式 / 来源系统 / 目标系统 / 最近运行结果                    │
│ 列表：流程名称 | 状态 | 触发方式 | 来源→目标 | 最近运行 | 最近失败 | 操作       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

#### 12.3.4 运行中心 `/ucp/runs`：4 个执行处理看板

运行中心必须作为执行实例处理页面，承接流程执行、同步执行、重试处理等运行态事项。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 今日运行 | 当天执行实例数 | `/ucp/runs?timeRange=today` |
| 2 | 运行中 | 当前运行中的实例数 | `/ucp/runs?status=running` |
| 3 | 失败运行 | 最近 24 小时失败实例数 | `/ucp/runs?status=failed&timeRange=24h` |
| 4 | 待重试项 | 当前可重试或待重试实例数 | `/ucp/runs?retryStatus=pending` |

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 运行中心                                      [批量重试] [停止运行] [导出日志] │
├────────────────┬────────────────┬────────────────┬────────────────────────┤
│ 今日运行        │ 运行中          │ 失败运行        │ 待重试项                │
│ 386            │ 8              │ 17             │ 6                       │
└────────────────┴────────────────┴────────────────┴────────────────────────┘
│ 筛选：状态 / 流程 / 系统 / 时间范围 / 是否可重试                              │
│ 列表：执行ID | 流程 | 来源系统 | 状态 | 开始时间 | 耗时 | 错误摘要 | 操作       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

#### 12.3.5 事件处理 `/ucp/events`：4 个事件处理看板

事件处理页保持 4 个看板，聚焦事件接入、匹配、派发、死信。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 今日事件 | 当天接收事件数 | `/ucp/events?timeRange=today` |
| 2 | 成功派发 | 当天成功派发事件数 | `/ucp/events?dispatchStatus=success&timeRange=today` |
| 3 | 未匹配 | 当前未匹配规则事件数 | `/ucp/events?matchStatus=unmatched` |
| 4 | 死信事件 | 当前未处理死信事件数 | `/ucp/events/dead-letters?status=pending` |

开发要求：

- 触发规则入口在事件处理页内部展示，不在左侧菜单平铺。
- 死信队列入口在事件处理页内部展示；进入 `/ucp/events/dead-letters` 时左侧仍高亮 `事件处理`。
- 事件处理页不得展示全局运行成功率、失败率、平均耗时，这些归属监控告警。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 事件处理                                [触发规则] [死信队列] [重放事件]       │
├────────────────┬────────────────┬────────────────┬────────────────────────┤
│ 今日事件        │ 成功派发        │ 未匹配          │ 死信事件                │
│ 2,104          │ 2,031          │ 18             │ 7                       │
└────────────────┴────────────────┴────────────────┴────────────────────────┘
│ 筛选：事件类型 / 来源系统 / 匹配状态 / 派发状态 / 时间范围                    │
│ 列表：事件ID | 类型 | 来源 | 匹配规则 | 派发状态 | 接收时间 | 操作             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

#### 12.3.6 监控告警 `/ucp/monitor`：6 个运行质量看板

监控告警页保留 6 个看板，并作为运行质量和告警指标的唯一权威页面。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 总执行 | 最近 24 小时执行实例数 | `/ucp/runs?timeRange=24h` |
| 2 | 成功率 | 最近 24 小时执行成功率 | `/ucp/monitor?metric=success_rate&timeRange=24h` |
| 3 | 失败率 | 最近 24 小时执行失败率 | `/ucp/monitor?metric=fail_rate&timeRange=24h` |
| 4 | 平均耗时 | 最近 24 小时平均执行耗时 | `/ucp/monitor?metric=avg_duration&timeRange=24h` |
| 5 | 运行中 | 当前运行中实例数 | `/ucp/runs?status=running` |
| 6 | 当前告警 | 当前未关闭告警数 | `/ucp/monitor?status=open` |

开发要求：

- 成功率、失败率、平均耗时、当前告警不得在接入系统、流程编排、资产治理中作为同级 KPI 重复展示。
- 通知模板入口在监控告警页内部展示；进入 `/ucp/monitor/templates` 时左侧仍高亮 `监控告警`。
- 趋势图、告警列表、通知策略应围绕这些指标展开。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 监控告警                                [通知模板] [告警策略] [导出报表]       │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ 总执行        │ 成功率        │ 失败率        │ 平均耗时      │ 运行中        │ 当前告警      │
│ 1,246        │ 97.9%        │ 2.1%         │ 1.8s         │ 8            │ 3            │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 运行质量趋势                  │ │ 当前告警列表                   │
│ 成功率/失败率/耗时/吞吐趋势     │ │ 级别、对象、状态、负责人、操作   │
└──────────────────────────────┘ └──────────────────────────────┘
```

---

#### 12.3.7 资产治理 `/ucp/assets`：6 个资产与治理看板

资产管理统一命名为资产治理。资产治理页保留 6 个看板，只展示资产、治理、质量类指标。

| 序号 | 看板名称 | 指标口径 | 点击下钻 |
| ---: | --- | --- | --- |
| 1 | 资产总数 | 当前已登记资产总数 | `/ucp/assets` |
| 2 | 系统资产 | 当前系统类资产数 | `/ucp/assets?assetType=system` |
| 3 | 资源接口 | 当前资源/API/数据表资产数 | `/ucp/assets?assetType=resource` |
| 4 | 流程资产 | 当前流程类资产数 | `/ucp/assets?assetType=pipeline` |
| 5 | 治理任务 | 当前未完成治理任务数 | `/ucp/governance?status=open` |
| 6 | 质量问题 | 当前未关闭质量问题数 | `/ucp/quality?status=open` |

必须移除或迁移：

- `24h 事件`、`24h 运行`、`成功率`、`失败率` 等运行过程指标不得出现在资产治理 KPI 中。
- 资产治理可通过 Tab 或内部入口访问资产目录、治理任务、主数据治理、数据质量、冲突处理。
- 进入 `/ucp/governance`、`/ucp/master-data`、`/ucp/quality`、`/ucp/conflicts` 时左侧仍高亮 `资产治理`。

UI 示意：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 资产治理                            [新建资产] [治理任务] [质量规则] [冲突处理] │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ 资产总数      │ 系统资产      │ 资源接口      │ 流程资产      │ 治理任务      │ 质量问题      │
│ 168          │ 12           │ 86           │ 42           │ 9            │ 14           │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
│ Tab：资产目录 | 治理任务 | 主数据治理 | 数据质量 | 冲突处理                       │
│ 列表：资产名称 | 类型 | 来源系统 | 负责人 | 敏感级别 | 质量状态 | 最近更新 | 操作     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 12.4 指标去重与迁移规则

开发时必须按以下规则处理重复看板：

| 重复/冲突指标 | 最终归属 | 其他页面处理方式 |
| --- | --- | --- |
| 成功率 | 监控告警 | 概览只可展示摘要入口；其他页面不得作为 KPI 展示。 |
| 失败率 | 监控告警 | 概览只可展示摘要入口；流程页只展示“最近失败流程”。 |
| 平均耗时 | 监控告警 | 其他页面不得作为 KPI 展示，可在明细行辅助展示。 |
| 当前告警 | 监控告警 | 概览只可展示摘要入口；系统页不得重复作为 KPI。 |
| 24h 运行/总执行 | 运行中心、监控告警 | 概览只可展示摘要入口；资产治理不得展示。 |
| 今日事件/死信 | 事件处理 | 概览只可展示待处理死信摘要入口；资产治理不得展示。 |
| 凭证风险 | 接入系统 | 概览可在风险待办中作为入口，但不得作为概览 KPI 替代全局指标。 |
| 质量问题 | 资产治理 | 概览可在风险待办中作为入口，但不得在监控告警中替代运行告警。 |
| 触发类型/调度类型 | 流程编排筛选器 | 不作为 KPI 卡片。 |

---

### 12.5 统一开发要求

#### 12.5.1 组件与样式要求

1. 优先抽象统一 KPI 组件，例如：
   - `UcpKpiCard.vue`
   - `UcpKpiStrip.vue`
2. KPI 组件至少支持以下属性：
   - `title`：标题。
   - `value`：数值。
   - `unit`：单位，可选。
   - `trend`：趋势，可选。
   - `status`：`normal | warning | danger | info`。
   - `tooltip`：统计口径说明。
   - `targetRoute`：点击下钻路由，可选。
   - `query`：点击下钻参数，可选。
3. 所有 KPI 卡片视觉风格保持一致：标题、数值、趋势、状态色、hover、点击态统一。
4. 卡片数量为 4 个时按四列展示；6 个时按六列或响应式 3+3 展示。
5. 小屏幕下按 2 列或 1 列自适应，不允许横向溢出。

#### 12.5.2 路由与高亮要求

1. `/ucp` 必须是数据连接概览页。
2. 左侧菜单仍保持 7 个四字菜单：
   - 接入系统
   - 流程编排
   - 运行中心
   - 事件处理
   - 监控告警
   - 场景方案
   - 资产治理
3. 以下内部页面不在左侧菜单平铺，但必须保持父菜单高亮：
   - `/ucp/events/triggers` → 事件处理
   - `/ucp/events/dead-letters` → 事件处理
   - `/ucp/monitor/templates` → 监控告警
   - `/ucp/governance`、`/ucp/master-data`、`/ucp/quality`、`/ucp/conflicts` → 资产治理
   - `/ucp/scenarios/oa-sync`、`/ucp/scenarios/external-accounts` → 场景方案
4. 所有 KPI 跳转必须使用现有路由体系，不允许新增孤立页面。

#### 12.5.3 数据与接口要求

1. 如果后端已有聚合接口，前端直接使用聚合接口。
2. 如果后端暂无聚合接口，前端可以先基于现有列表接口计算展示，但必须封装在 API/adapter 层，避免页面内散落计算逻辑。
3. 指标字段命名建议统一为：

```ts
interface UcpKpiItem {
  key: string
  title: string
  value: number | string
  unit?: string
  status?: 'normal' | 'warning' | 'danger' | 'info'
  tooltip: string
  targetRoute?: string
  query?: Record<string, string | number | boolean>
}
```

4. 所有统计口径必须在 tooltip 或卡片副标题中明确展示。
5. 页面内列表筛选条件必须能接收 KPI 跳转参数，并自动回显筛选状态。

#### 12.5.4 权限要求

1. KPI 卡片对应页面无权限时，不展示可点击态；必要时隐藏卡片或展示禁用态。
2. 用户无 `ucp.governance` 权限时，不展示治理任务、主数据治理、数据质量、冲突处理入口。
3. 用户无 `ucp.assets` 权限时，不展示资产目录入口。
4. 隐藏路由仍必须做权限校验，不能只依赖菜单隐藏。

#### 12.5.5 文案要求

1. 页面标题统一使用：数据连接概览、接入系统、流程编排、运行中心、事件处理、监控告警、场景方案、资产治理。
2. “资产管理”统一改为“资产治理”。
3. 卡片名称必须使用本节定义名称，不允许同义词混用，例如“总执行”和“24h运行”不可在同一页面混用为同一指标。
4. 时间窗口文案必须明确：今日、最近 24 小时、当前、当前未关闭。

---

### 12.6 最终验收清单

开发完成后，必须按以下清单验收：

1. `/ucp` 展示 6 个全局摘要看板：接入系统、活跃流程、24h运行、失败率、待处理死信、当前告警。
2. `/ucp/systems` 只展示 4 个系统配置看板：接入系统、数据资源、凭证风险、异常系统。
3. `/ucp/pipelines` 只展示 4 个流程定义看板：流程总数、启用流程、禁用流程、最近失败流程。
4. `/ucp/runs` 展示 4 个执行处理看板：今日运行、运行中、失败运行、待重试项。
5. `/ucp/events` 展示 4 个事件处理看板：今日事件、成功派发、未匹配、死信事件。
6. `/ucp/monitor` 展示 6 个运行质量看板：总执行、成功率、失败率、平均耗时、运行中、当前告警。
7. `/ucp/assets` 展示 6 个资产治理看板：资产总数、系统资产、资源接口、流程资产、治理任务、质量问题。
8. 接入系统、流程编排、资产治理中不得再出现成功率、失败率、平均耗时、当前告警作为同级 KPI。
9. 资产治理中不得出现 24h 事件、24h 运行等过程指标。
10. 流程编排中触发类型、调度类型只作为筛选器或标签，不作为 KPI。
11. 所有 KPI 卡片可点击下钻，且跳转后筛选条件正确回显。
12. 所有 KPI tooltip 或副标题展示统计口径。
13. 左侧菜单仍为 7 个四字菜单，不新增“概览”菜单。
14. 内部页面路由高亮父菜单正确。
15. 权限不足时入口、卡片点击态、隐藏路由校验均符合权限要求。
16. 前端构建通过，浏览器强制刷新后可看到最新 UI。
