---
name: performance-spec-development
description: 在 HR Portal 项目中讨论、编写规格、实现、测试或验收绩效管理工作时使用，尤其涉及 specs/002-performance-management、绩效周期、评估、项目、申诉、绩效权限、员工快照或 PerformanceLayout。
---

# 绩效规格开发

本 skill 用于治理长期运行的绩效管理工作，使其成为 HR Portal 内的模块化业务应用。保持需求、UI 决策、API 契约、数据模型、原子任务、实现范围和验收证据相互关联。对于跨层或多智能体工作，加载 [execution-contract.md](references/execution-contract.md)、[task-card-template.md](references/task-card-template.md)、[acceptance-evidence.md](references/acceptance-evidence.md) 和 [migration-coordination.md](references/migration-coordination.md)。

## Skill 真源与镜像

项目内 `.claude/skills/performance-spec-development/` 是 Claude Code 运行时真源，`.codex/skills/performance-spec-development/` 是兼容镜像。编辑任一副本前先比较同名文件；同一次变更必须同步两份并验证内容一致。发现副本分叉时，停止规格定稿和实现，先报告差异，不得静默选择或只更新一份。

## 规格门禁脚本

使用 `scripts/check_ui_spec.py` 做确定性检查，不依赖模型自检：

```text
python .claude/skills/performance-spec-development/scripts/check_ui_spec.py <feature-dir> --task-id PM-xxx-Txx --source-dir hr-portal/frontend/src --phase implementation
python .claude/skills/performance-spec-development/scripts/check_ui_spec.py <feature-dir> --task-id PM-xxx-Txx --source-dir hr-portal/frontend/src --phase acceptance --compare-contract <rendered-ui-contract.json>
```

脚本必须在实现前和勾选任务前运行。`--phase implementation` 还要求采集完整性通过且目标范围已标记 `implementation_readiness=ready`；`--phase acceptance` 必须提供 rendered contract。脚本检查：必需规格文件、跨文档状态一致性、当前任务显式前置任务、采集状态、component-model 的 `source_state_ids` 是否进入 manifest，以及前端禁止项（`min-height:768px`、`min-height:800px`、`max-height:600px`、共享性能组件的模板页 `min-width:1200/1300px`）。返回非零即阻塞，不得以测试或构建成功覆盖。

门禁脚本还会拒绝摘要值（如 `captured`、`observed`、`exists`）充当 geometry/styles/SVG 的最终值；geometry/styles 必须为非空对象，viewport 必须包含数值 width/height/dpr，fields/interactions/SVG 必须是结构化对象。`schema_version: 3` 的契约还必须校验 `variant_contracts` 的 visible/forbidden/line/ownership 结构。完成实现后，使用 `--compare-contract <rendered-ui-contract.json>` 做 extracted target contract 与实际渲染契约的反向比较；没有实现契约或截图 diff 时，仍记为 `not-run`，不得宣称像素通过。

`--task-id` 读取当前任务卡的显式 `前置条件`，只检查直接依赖及其门禁；不按任务编号把所有更早任务视为依赖。缺少显式前置条件时返回阻塞。后续任务未完成不阻塞当前任务。缺少 `--task-id` 时只作全功能审计并给出警告，不能作为任务启动证据。

脚本位于 `.claude` 真源和 `.codex` 镜像的同一路径；变更必须同步并比较内容。

### 定向门禁豁免

只有用户明确授权修改门禁策略时，功能目录才可提供 `ui-gate-waivers.json`。豁免必须绑定单一 `task_id`，逐条精确列出 `allowed_errors`，记录批准人、日期、原因和允许修改的 `scope`；检查器只把完全匹配的错误转为 `waived_error` 警告，任何新增或未列出的错误仍阻塞。豁免不改变全功能 `completion_status`/`pixel_restore_status`，不等于像素验收通过，也不得用于勾选与豁免范围无关的任务。`.claude` 与 `.codex` 的检查器和本说明必须保持一致。

## Collector Readiness Gate

在 UI Expert 阶段前先验收采集证据；“文件存在”不等于“可实现”。对当前 feature 或目标 variant 记录 `capture_readiness`：

- `capture_integrity`：`passed` / `blocked` / `invalid`；检查 JSON、NaN/Infinity、viewport/DPR、状态 ID、证据路径和安全边界；
- `capture_completeness`：`passed` / `incomplete` / `blocked`；检查目标入口、分支、before/after 动作和完整 artifacts；
- `implementation_readiness`：`ready` / `design_incomplete` / `blocked` / `not-run`；只有 Brief 所覆盖的范围可以标记 ready；
- `readiness_scope`：`feature` 或 `variant`；feature 有无关缺口时只能标记具体 variant ready；
- `target_variant_keys`、`blockers`、`evidence`：必须明确记录，不得用 captured/observed 等摘要代替。

只有 `capture_integrity=passed` 且目标范围 `implementation_readiness=ready`，才能进入 Frontend Engineer 阶段。缺少 disabled、resize 或其他与当前 variant 无关的证据时，保持全功能状态为 blocked，并记录局部 variant 范围；不得静默补造证据，也不得用 task waiver 改写 capture readiness。采集失败或证据缺失时先离线报告，不得自动重新克隆；重新采集必须由用户明确要求并授权。

采集器的 `analyze_capture` 输出 `capture_model.json`；UI Expert 必须优先读取其中的 `capture_readiness` 和 `implementation_brief`，再将 Brief 投影为 feature 的 `extracted-ui-contract.json#/variant_contracts`。若 Brief 为 `design_incomplete` 或存在 `variant_candidates`，只能补充契约或报告阻塞，不能直接进入 Frontend Engineer 阶段。

## 证据到实现的确定性流水线

采集证据不是实现授权。所有采集 UI 必须按以下阶段顺序推进，不得跳过中间契约：

1. **Evidence selection**：选定权威 `source_state_ids`、入口、规则变体、目标截图和完整证据包；已有有效采集产物时，不得为了确认解释或填充文案再次调用 `clone_webpage`/捕获工具。只有用户明确要求新的授权采集，或现有证据确实缺失且用户授权补采时才可采集。
2. **Variant contract**：从同一状态的截图、`after.html`、layout、computed 和 interaction evidence 提炼 `variant_key`、可见元素、禁止元素、文本顺序、同行关系、组件归属、几何和样式。仅记录字段清单不算完成。
3. **Document projection**：以 `extracted-ui-contract.json` 的变体契约为真源，投影到 `component-model.md`、`pixel-contract.md`、`acceptance-contract.md` 和 `atomic-tasks.md`；Markdown 不得重新发明另一套字段语义。
4. **Test contract**：实现前生成正向和反向断言，至少覆盖可见元素、禁止元素、入口差异、文案顺序、单行/换行关系和动态分支。
5. **Implementation**：只修改已确认原子任务允许的文件；组件按 `entry_mode + review_type + config_discriminator` 选择显式变体，不用名称、索引或通用模板猜测。
6. **Runtime acceptance**：构建后启动实际应用或容器，进入目标状态，生成 rendered contract 和截图，再比较 geometry、styles、text/visibility、layout relations、container insets 和 variant invariants。HTTP 200、单测和构建不能替代这一阶段。

### 变体契约最低结构

`extracted-ui-contract.json` 的新版本变体必须包含 `variant_contracts`，每项至少有：

- `variant_key`、`entry_mode`、`review_type`、`config_discriminator`、`source_state_ids`；
- `visible_elements`：可见文本/节点及其 `owner`、`display_mode`；
- `forbidden_elements`：当前变体明确不得出现的节点或文案，允许为空但必须显式记录；
- `line_groups`：同一行、不可换行或需要合并展示的元素关系；
- `component_ownership`：页面、规则 renderer 和附加卡片的职责边界。

旧 `schema_version: 2` 契约继续按历史规则验收，但进入新 UI 变体或修改现有变体时必须升级并补齐上述结构。缺少变体契约只能报告为 `design_incomplete`，不得把字段存在误当作可见性契约。

任务级门禁只阻断当前任务声明的直接前置条件；全功能像素门禁另行报告，不得用无关历史缺口阻断不相关任务。`blocked/not_observed` 表示证据缺失，`invalid_evidence` 表示已观察到的数值或结构不符合约束，两者不得混报。

## UI 专家到前端工程师的交接

对 UI 任务，必须显式执行三个角色阶段；同一个智能体可以连续承担角色，但不得跳过交接边界：

### UI Expert

- 读取权威采集状态和目标截图，确定 `source_state_ids`、`variant_key`、入口和配置判别键；
- 产出唯一的 **UI Implementation Brief**：`variant_contracts`、组件树、visible/forbidden 元素、line groups、component ownership、geometry/style tokens 和状态矩阵；
- 只确认“应该如何实现”，不直接根据字段清单猜测模板或可见性。

### Frontend Engineer

- 只根据 UI Implementation Brief、原子任务和 API 契约实现；
- 为每个 visible/forbidden/line-group 生成正向和反向测试；
- 不得自行改变 variant 结构、组件归属、文案顺序或将只读摘要改为编辑表单；变更契约必须先回到 UI Expert 阶段。

### UI Verifier

- 在真实应用或容器中进入同一目标状态；
- 生成 rendered contract 和截图，比较 text/visibility、geometry、styles、line groups、container insets 和 variant invariants；
- 将结果分别报告为 `passed`、`not-run` 或 `blocked`；构建和单测只能证明代码质量，不能替代视觉验收。

UI Implementation Brief 默认存放在 `extracted-ui-contract.json` 的 `variant_contracts` 中；Markdown 只作说明投影。历史 `schema_version: 2` 仅允许读取，新增或修改 UI variant 必须先升级并补齐 Brief。

1. 确认仓库根目录和实际 Git 根目录。
2. 阅读 `specs/002-performance-management/START_HERE.md`。
3. 提出变更前阅读相关基线文件：`overview.md`、`integration.md`、`permission-model.md`、`data-model.md`、`workflow-design.md`、`roadmap.md` 和 `open-questions.md`。
4. 阅读当前功能目录、相关 ADR、现有路由、API 模块、模型、迁移和测试。
5. 编辑前检查 worktree，保留无关的未提交改动。
6. 若任务涉及 UI，遵循根 `AGENTS.md` 对 Spec 012 的阅读门槛：阅读其 `START_HERE.md`、相关 `ui-interaction.md`、`ui-implementation-guardrails.md`，以及适用的原子任务 UI 检查项后再设计或编码。若任务还涉及 UCP、数据接入、数据资产、Pipeline、Webhook、DataSource 桥接或其他外部系统，同时阅读所需的 Spec 011/012 文档。
7. 分解跨层工作前，冻结共享 DTO、API、策略、适配器、执行器、错误码、事件、真源、事务和迁移契约。阅读 `references/execution-contract.md`；未解决的共享契约会阻塞实现。

不要仅凭用户请求推断现有行为。报告缺失的上下文、矛盾和假设。

对于持久化敏感的工作，验证周期开始快照、历史数据边界、读取/重开行为；当前花名册或组织变更不得静默重写已开始的周期。

## 对请求分类

将请求分类为以下之一：

- 新业务能力；
- 现有能力的增强；
- 缺陷修复；
- 权限或安全变更；
- 数据迁移；
- UI 变更；
- 架构决策；
- UCP 或外部系统集成。

选择最小的适当产物：

- 新能力：`specs/002-performance-management/features/PM-xxx-name/`。
- 跨功能或小范围变更：`specs/002-performance-management/changes/CR-xxx-name/`。
- 长期架构选择：`specs/002-performance-management/decisions/ADR-xxx-name.md`。
- 小缺陷或仅测试工作：更新相关功能任务或变更记录，不创建完整的新功能规格。

不要直接在 Spec 根目录随意创建文件，应在功能、变更或决策产物适当时使用它们。

## 自动分流最小输入

接受自然语言请求。不要求用户在开始前复制模板或选择模式。

从请求推断模式，并在回复开头说明推断：

| 用户意图 | 推断模式 | 默认动作 |
|---|---|---|
| 请求讨论、建议或方案 | 讨论 | 阅读上下文，分析边界，列出关键决策，不编辑代码。 |
| 请求需求、文档、任务分解或规格 | 规格 | 定位或创建适当的 Spec 产物，编写/更新规格，不编辑业务代码。 |
| 请求开发、实现或修复 | 实现 | 需要确认的功能/任务和适用的 UI 确认后才能编辑代码。 |
| 请求验收、测试或完成检查 | 验收 | 依据规格、蓝图、API、持久化和任务证据核验实现。 |

按此顺序推断目标产物：

1. 使用用户提供的显式 `PM-xxx`、`CR-xxx`、`ADR-xxx`、文件路径或原子任务 ID。
2. 搜索现有功能、变更和决策产物中匹配的业务术语。
3. 若无匹配且请求仅讨论，视为未归档的 intake，提出下一个产物而不创建。
4. 若无匹配且请求是规格工作，分配下一个顺序 `PM-xxx` 或 `CR-xxx` 标识，创建最小目录，复制或实例化相关模板，并说明所选名称。
5. 若请求是实现工作且无已确认任务或明确的现有规格，停在范围澄清；不要基于假设创建业务代码。

新能力使用此默认顺序：

```text
自然语言请求
-> 分类并检查上下文
-> 创建/更新 intake 和功能规格
-> 识别待决决策
-> 需要时创建/确认 UI 蓝图
-> 创建原子任务
-> 一次实现一个已确认任务
-> 验证并更新证据
```

不要强制用户一次性提供所有模板字段。提取可用内容，将剩余项记入假设和待决问题，只问真正阻塞规格或实现的问题。

## 正式规格前要求澄清

创建或更新正式功能规格前，检查请求是否遗留关键业务决策未决。以下视为阻塞，除非基线规格已作答：

- 角色定义、角色来源、授权范围或角色重叠；
- 每个角色可查看、编辑、提交、调整或发布哪些数据；
- 周期快照与实时关系的行为；
- 人员、组织、项目或外部身份来源；
- 状态流转、不可逆操作、计算规则或异常处理；
- 新页面信息架构、工作流步骤或所需 UI 行为。

存在一个或多个阻塞时：

1. 说明请求处于澄清模式，即使用户要求规格。
2. 只总结已从用户和现有文档确认的事实。
3. 问最小量能解除下一步决策的具体问题；归组相关问题，通常一次不超过五个。
4. 不创建正式功能目录、规格、原子任务文件、UI 蓝图或业务代码。
5. 等待用户回答或明确指示以记录假设继续。

只有用户回答阻塞问题、或明确说明以所述假设继续后，才创建正式规格和任务产物。将每个剩余假设标记为未决；绝不将其表述为已确认需求。

若此前运行在澄清前创建了产物，保留为草稿。添加或更新其状态为 `待澄清`，列出阻塞项，直到用户确认才将其作为实现依据。

## 自动应用 UI 门槛

从请求的行为判断 UI 影响，而非等用户标注：

- 将路由、页面、仪表盘、工作台、表单、向导、表格、按钮、角色可见操作、页面流转和用户反馈视为 UI 工作。
- 将新页面、复杂表单/向导、多角色工作台、多状态工作流或信息架构变更视为需要蓝图。
- 需要蓝图的工作，生成或更新绩效 UI 蓝图和确认记录，然后等待用户显式确认后再正式 UI 编码。
- 将仅后端工作、迁移、测试、文案变更、校验修复和保留信息架构的小 UI 变更视为不需要蓝图；在功能交互文档中记录 UI 影响即可。
- 本仓库任何 UI 工作，阅读根 `AGENTS.md` 要求的 Spec 012 UI 门槛。Spec 011 蓝图仅作说明性参考，除非任务本身涉及 UCP。

## 选择工作模式

判断用户要求的是讨论、规格、实现还是验收。

### 讨论模式

- 阅读上下文并识别冲突。
- 只问或列出实质影响范围、数据、权限、工作流或 UI 的问题。
- 明确陈述假设。
- 不编辑代码。

### 规格模式

- 创建正式 Markdown 产物前运行澄清门槛。
- 若关键决策未决，提问并等待；不要为填补空白而写功能规格。
- 确认后，更新或创建最小适当的 Markdown 产物。
- 定义背景、目标、非目标、角色、场景、边界、影响矩阵、数据、API、业务规则、权限、UI、测试、验收、风险和待决问题。
- 将大工作拆分为可独立测试的原子任务。
- 无证据不得将任务标记为已确认或已完成。

### 实现模式

编码前，输出开发启动确认：

- 当前 Spec、功能目录和原子任务；
- 已阅读的文件和规格；
- 要修改的范围；
- 明确的非范围；
- UI、迁移、权限、UCP 和外部系统影响；
- 已确认假设和阻塞项；
- 计划测试和验收证据。

只实现已确认的原子任务。保留无关改动，避免相邻重构。

### 验收模式

适用时从 UI 追踪到实际 API 载荷、服务/数据库行为和重开/读取行为。先运行聚焦测试，再酌情做更广验证。分别报告通过、未运行和被阻塞的检查。

## UI 编码前要求 UI 蓝图

对于新页面、复杂表单或向导、多角色工作台、多状态工作流、重大信息架构变更或新页面间流转：

1. 在 `specs/002-performance-management/ui-blueprints/` 创建或更新绩效蓝图。
2. 为每个 UI 任务生成独立的 PNG 视觉产物。文件名用任务 ID 和描述性 kebab-case 名，例如 `PM-T002-T02-implemented-settings-shell.png`；绝不将一个 PNG 复用于无关 UI 任务，或静默覆盖其他任务的证据。
3. 记录蓝图路径、PNG 路径、页面路由、角色、入口、布局、字段、按钮、加载态、空态、错误态、无权限态、成功反馈、流转和危险操作确认。
4. UCP 蓝图仅作视觉和交互示例，除非任务确实涉及 UCP。
5. 正式 UI 实现前等待用户显式确认蓝图。
6. 实现后，用实际 PNG 路径更新任务证据，并确认视觉产物对应已实现 UI，而非仅计划设计。

UI 确认必须标识：

- 蓝图路径和版本；
- 受影响路由和角色；
- 已确认的状态和流转；
- 蓝图覆盖的任务 ID；
- 未决 UI 问题。

在引用的蓝图版本被显式确认前，任务不得开始正式 UI 实现。

对仅后端变更、迁移、仅测试变更、文案变更、校验修复或不改变信息架构的小调整，不要求新的完整 HTML 蓝图。较小的 UI 变更需要记录时更新 `ui-interaction.md`。

## 产出完整规格

对于功能，使用 `specs/002-performance-management/templates/` 中的模板，只创建适用的文件。至少覆盖：

- 背景、目标、非目标、角色、场景和范围；
- 数据库 schema、索引、默认值、迁移、降级和旧数据兼容；
- API URL、方法、请求/响应 schema、权限、状态码和错误；
- 状态流转、事务边界、幂等性、并发和失败处理；
- 前端路由、布局、字段规则、按钮、状态、反馈和无障碍考虑；
- HR Portal 入口权限与绩效内部权限；
- 敏感数据、脱敏、查询安全、外部系统边界和可审计性；
- 聚焦测试、回归测试、构建检查和验收证据；
- 假设、未决问题、依赖、风险和回滚计划。

将周期开始快照视为历史数据。不要让当前花名册或组织变更静默重写已开始的绩效周期。对每次工作流或状态变更，定义当前状态、动作、操作者/权限、前置条件、下一状态、错误码、可重试性和审计事件。

## 原子任务规则

使用 `PM-001-T01` 之类 ID。保持每个任务聚焦一个主要交付物。加载 [task-card-template.md](references/task-card-template.md)，包含前置条件、必读、允许/禁止文件、输入/输出契约、共享文件合并规则、UI/API/数据库/权限/外部系统影响、Given/When/Then 测试、验收标准、完成证据、阻塞项、非范围和完成定义。

保持数据库迁移、后端契约、权限逻辑、前端实现、UI 校验和回归测试在可独立失败时相互分离。实现智能体只能修改任务卡文件；范围扩展需主智能体批准。

## 多智能体协调

- 一个实现智能体负责一个任务或明确归组的任务。
- 不得并行修改同一共享文件。
- 智能体必须将缺失前置、契约缺口、文件冲突或环境失败报告为阻塞。
- 智能体不得标记任务完成。主智能体在标记 `[x]` 前检查 diff、测试、迁移、边界和证据。
- 绝不要把未运行或跳过的测试报告为通过。

## 迁移协调

任何数据库变更加载 [migration-coordination.md](references/migration-coordination.md)。只创建新迁移，绝不编辑已有迁移，遇到多个 Alembic head 或不明确依赖时停止。

## 验收证据

加载 [acceptance-evidence.md](references/acceptance-evidence.md)。每个任务需要可执行的 Given/When/Then 覆盖和真实测试文件/命令。分别报告通过、未运行和被阻塞的检查。对持久化敏感变更，追踪 UI → 实际 API 载荷 → 服务/数据库 → 读取/重开。

## 跨产物一致性

最终确定规格或验收结果前，对比基线文档、相关 Spec、实际模型/API、权限名、状态枚举、快照语义、任务 ID 和依赖、测试文件和命令、迁移链、UI 路由/组件、外部系统边界。绝不静默选择冲突中的一方；将冲突记录为阻塞并标识权威来源。

## 发布阻塞标准

当任一必需任务缺证据、权限缺允许/拒绝覆盖、历史快照可被静默重写、适配器丢字段、迁移升级/降级未验证、必需 UI 蓝图未确认、未解决的 P0/P1 矛盾存在、或完成仅依赖本地测试却声称生产可用时，不得宣称功能完成。

只有在开发、迁移、UI 校验、测试、验收和证据都完成后才标记 `[x]`。更新功能任务文件和任何阶段级路线图/状态索引。使用 [task-card-template.md](references/task-card-template.md) 做结构化交接并报告：

- 已完成任务 ID；
- 必读和未修改的受保护文件；
- 新增和修改的文件；
- 输入/输出契约、兼容行为、错误码和副作用边界；
- 测试/构建命令及实际结果、跳过/警告；
- UI 蓝图/版本和校验结果；
- 迁移状态和真实升级/降级证据；
- 夹具、审计、回归或数据对比证据；
- 未完成任务和阻塞项；
- 已知风险和部署步骤；
- 主智能体是否应检查该任务及原因。

绝不要仅凭本地测试声称生产部署。绝不要声称测试通过除非确实运行过。

## 采集 UI 规格完成门禁

对任何以采集证据支撑的像素级 UI，正式实现前必须同时存在：`spec.md`、`capture-manifest.md`、`capture-completion-checklist.md`、`component-model.md`、`extracted-ui-contract.json`、`acceptance-contract.md` 和 `atomic-tasks.md`；需要精确几何时还必须有 `pixel-contract.md`。每个文件必须声明 `completion_status`、`pixel_restore_status` 和统一的 `uncovered_reasons`。

`extracted-ui-contract.json` 是采集证据到开发文档之间的机器可校验中间产物，必须逐状态记录 `source_state_id`、session/URL/viewport、完整 artifacts、components、fields、geometry、styles、interactions 和 svg；顶层 `coverage` 的所有未映射/冲突数组必须为空。Markdown 文档必须是该 JSON 的说明投影，不得只写人工摘要。

只有同时满足以下条件才能写“规格已确认”或 `ready_for_implementation`：

- 所有必需 `source_state_ids` 均能映射到真实 session、URL、viewport 和完整证据包；
- `component-model.md` 已覆盖 component tree、字段/选项、props/events、状态机、几何、样式和适用状态；
- `capture-completion-checklist.md` 无未解决的必需项；
- `spec.md`、组件模型、验收契约和原子任务的 blocker/假设/待决项完全一致；
- 原子任务逐项引用组件、状态、`source_state_ids`、目标截图和可执行验收命令。

任一条件不满足时，统一记录 `completion_status: incomplete`、`pixel_restore_status: blocked`；允许继续整理证据和文档，但禁止正式 UI 实现、像素验收和完成勾选。不得同时出现“无 blocker”与任一未决假设、未完成清单或 blocked 任务。

## 采集性能 UI 的可复用组件门槛

## 采集性能 UI 的像素证据门槛

像素级实现被阻塞，直到每个必需的 `source_state_id` 都有完整证据包。采集器必须提供 `before_html`、`after_html`、`layout`、`computed`、`target_contract`、`screenshot` 和 `interaction_evidence`。仅 CSS 的视觉变化（背景、颜色、透明度、阴影、伪元素或 SVG currentColor）也是有效状态，即使 HTML 和布局未变。不要将其过滤为未变化的 hover。

对每个重复控件，开发契约必须包含：

- `component_id` 和 `source_state_ids`；
- DOM/祖先层级和选择器契约；
- `default`、`hover`、`focus`、`active`、`disabled`、`expanded`、`collapsed`、`dragging`、`after-click` 的状态矩阵（适用时）；
- 精确的外层/图标几何、间距、计算样式和 z-index/overflow；
- 精确的内联 SVG `viewBox`、尺寸、path、fill/stroke；
- before/after DOM 指纹和截图；
- 带几何和图标断言的 Given/When/Then 验收用例。

若任一必需产物缺失，记录 `completion_status: incomplete` 和 `uncovered_reasons`；实现和像素验收被阻塞。开发者必须在代码/测试证据中引用契约的 `source_state_ids`，不得用猜测的 CSS、Element Plus 图标、文字字形或近似 SVG path 代替。组件可共享行为同时暴露有证据支撑的视觉变体（例如常规与加粗展开图标）。

### 复合控件的 root/part 分层门槛

当一个视觉控件包含外层组件、内部输入、操作柄、操作项或 SVG 子节点时，采集器和提炼器必须保留完整层级，不能用任意子节点的 bbox 代表组件根节点。每个复合控件必须输出：

- `component_root`：可视外框、交互命中区和 `bbox` 的唯一根节点；
- `parts`：按 `input_wrap`、`input`、`handle`、`handle_item`、`svg` 等语义命名的直接或嵌套子节点；
- 每个节点的 `bbox_role`、稳定 selector/id、`parent_id`、`source_state_id` 和证据路径；
- root、part、input、handle、SVG 各自的 computed styles，不得扁平化为单一 `control` 值；
- `variant`、viewport、DPR 和 state，禁止跨尺寸变体合并几何。

对于 `ud__input-number` 等复合数字控件，至少应区分 `component_root`、`input` 和 `handle` 的 bbox。`input` 的宽高只能用于输入区域，不能写入组件 `geometry.bbox`。仓库侧可用 `scripts/normalize_compound_widget_contract.py` 将 `layout_roots` 归一化为 root/parts 契约；缺少必需 part 或 root bbox 时必须返回 `blocked`。

采集器或后处理器还必须对每个数字输入控件执行确定性校验：最近的 `.ud__input-number` 祖先作为 root；root、input、handle、两个 handle-item 和两个 SVG 的 bbox 均存在；root 高度约 `31px`、input 高度 `22px`、handle 为 `32×30px`。校验失败统一报告 `component_geometry_incomplete` 或对应几何错误，不得静默降级为单一 control bbox。`interval` 与 `score_bounds` 等变体必须分别保存 outer bbox 与 inner input bbox，并在每个记录中绑定 `viewport`、`dpr`、`variant` 和 `state`；不得跨 viewport 或 variant 合并尺寸。

对每个出现在两处或更多位置的采集交互，实现必须先创建或复用共享组件再写页面特定标记。组件清单必须包含：

- 一个展开/折叠控件，含采集到的图标、hover、focus、active、disabled 和 `aria-expanded` 状态；
- 一个 SVG/data-icon 操作按钮，用于编辑、删除、移动、关闭及相关操作；
- 一个拖拽手柄/命中区域契约，覆盖 `grab -> grabbing -> drop`、指针边界和键盘语义；
- 一个新建/编辑弹窗外壳，含 `mode` prop（`create | edit`）和一个校验状态机；
- 一个内容预览渲染器，被新建、编辑和已配置卡片状态共享。

每个共享组件必须记录其 `source_state_ids`、所属状态、props/emits、几何和验收用例。页面不得用不同 SVG、文字字形或略有差异的事件处理器重复同一控件。特定位置的布局属于父级；视觉和交互行为属于共享组件。

验收前，验证新建和编辑使用同一组件树，预览和已配置卡片使用同一预览渲染器，抽屉/卡片展开控件暴露相同状态属性。缺少组件抽取会阻塞像素级验收。

### 采集性能 UI 的结构提炼门槛

像素级实现被阻塞，直到每个可见结构都从采集证据中提炼出来，而非凭空捏造。写任何组件或页面前：

1. 从 `capture_model.json` 和状态产物（`layout.json`、`after.html`、`computed`）提炼真实的字段/列/选项清单和布局骨架。逐元素记录：
   - 表格列：精确 label 和像素宽度；
   - 表单字段：精确 label、placeholder、字数限制（`/1000`）、控件类型（input / textarea / radio 组 / checkbox 组 / select）和字段顺序；
   - 下拉/单选/复选选项：完整选项列表，绝不自编枚举；
   - 按钮：文字、bbox、背景和文字颜色，以及精确 SVG/data-icon；
   - 布局骨架（易漏，必提炼）：
     - 页面级最外层框架：header 背景色/高度、侧栏宽度/选中态、内容区背景、工具栏布局（按钮位置）、页面包裹结构；
     - 容器类型：居中弹窗（dialog）/ 抽屉（drawer）/ 全屏弹窗（full-screen-modal）/ 独立页面，及容器尺寸；
     - 头部结构：header 的组成（返回按钮、标题、副标题、操作区），以及是否跨页面/跨弹窗共用；
     - 容器内布局：卡片分组（分组标题、卡片圆角/内边距/边框）、栅格布局（label 列 + control 列、label 位置与宽度）、字段排列方向；
   - 视觉元素（易漏，必提炼）：组件的完整视觉构成，不只可见文字——
     - 线条/指示器：分隔线、选中指示线、下划线、高亮条（如 tab 底部分隔线 1px + 选中指示线 3px）；
     - 边框/圆角/阴影；
     - 图标/SVG/伪元素（::before/::after）；
     - 状态标记：勾选标记、badge、角标。

2. 加载 [component-model-template.md](references/component-model-template.md)，编码前输出结构化组件模型：
   - `component_tree`、`components`、`props`、`events`、`state_machines`；
   - 字段清单、选项枚举、几何、计算样式和状态矩阵；
   - 每行标注其 `source_state_ids`。

3. 禁止捏造表格列、表单字段、控件类型、下拉/单选/复选选项、placeholder、字数限制、容器类型、头部结构或容器内布局。采集证据里没有的字段名、列 label、选项值或布局结构是阻塞项，不是实现细节。猜测 CSS、图标或 SVG path 已被禁止；猜测结构和布局同样被禁止。

4. 对任何新页面或复杂表单，将此门槛视为需要蓝图：正式 UI 编码前，先输出提炼的字段/组件清单供用户确认。

5. 文字描述（字段、bbox、颜色、token）是结构骨架，不是视觉真相。像素级还原必须以采集截图为视觉真相：结构提炼时对照对应状态的截图（`states/**/after.png`、`hover_states/**/after.png`、全页截图）确认布局和视觉；写组件时把目标状态截图作为视觉参照，逐块对照还原容器、头部、卡片、字段和按钮。不能只靠文字值还原视觉。

### 组件拆解评估门槛（高组件开发）

对任何新页面或复杂表单，正式 UI 编码前必须先做组件拆解评估，输出分层组件清单供用户确认。遵循项目 `hr-portal/CLAUDE.md` 的「前端组件化原则」。

#### 三层拆解

1. **基础组件**（跨页面复用，放 `src/components/`）
   - 识别：按钮、表格、弹窗外壳、下拉、分页、图标、用户卡片、表单控件等通用控件；
   - 每个标注用途、各状态（default/hover/focus/active/disabled）、source_state_ids。

2. **业务组件**（本模块复用，放 `src/components/performance/`）
   - 识别：由基础组件组合、承载业务语义的控件（如评估题表格、编辑弹窗、筛选面板）；
   - 一个组件一件事：一个功能块 = 一个 `.vue` 文件，禁止把多个功能块写进同一个大文件。

3. **页面组装**（放 `src/views/`）
   - 页面文件只做组装：持有状态、组合组件，不写业务 UI 细节；
   - 通信用 `v-model`：组件对外用 v-model 暴露自己管的那块状态，父级持有完整 form。

#### 拆解评估输出

编码前输出一份组件拆解清单：

| 层级 | 组件 | 职责 | 是否复用 | source_state_ids |
|---|---|---|---|---|
| 基础 | 用户卡片 | 头像 + 姓名 | 跨页面 | ... |
| 业务 | 评估题表格 | 列表 + 操作 | 本模块 | ... |
| 页面 | ReviewQuestionManagement | 组装 | - | ... |

#### 强制规则

- 页面文件超过 200 行 → 继续拆；
- 判断「其他页面将来会不会用到」：是则抽到 `components/`；
- 弹窗外壳只做外壳 + v-model 分发，字段子组件按 field inventory 逐个对应；
- 复用采集到的共享组件：编辑/删除/关闭等操作按钮用统一 SVG 控件，禁止页面内用不同 SVG 或文字字形重复实现。

### 持久检查器与语义采集门槛

采集的绩效 UI 必须将检查与业务操作分离：

- 普通点击穿透到目标页面，并必须采集结果 after 状态；
- `Alt`/`Shift` 修饰的点击可锁定检查目标而不触发业务动作；
- 锁定目标不得停止持久 hover 检查器；只有显式的结束检查器动作才能停止它；
- 删除、确认、保存、提交等破坏性动作仍是人工确认检查点。

实时会话必须接受语义采集上下文更新并绑定到证据：

```json
{
  "component_id": "ConfiguredCardActionToolbar",
  "state": "button-hover",
  "note": "采集编辑按钮 hover 底色和点击后的编辑弹窗"
}
```

上下文、`source_state_ids`、可信事件、before/after 产物和用户备注必须保存在 `action_log.json` 和生成的组件契约中。即使截图存在，当检查器或语义上下文丢失时，采集也是不完整的。

## Perfect-Web-Clone-IDE 联动与采集后处理

当任务涉及已授权的绩效页面复刻或 Perfect-Web-Clone-IDE 采集结果时，采用两阶段边界：

```text
MCP 确定性采集
-> capture_model.json
-> Claude Code 离线分析
-> 结构化组件模型
-> 组件实现
-> Playwright 截图对比
-> 更新 Spec 验收证据
```

MCP 只负责浏览器采集：HTML、CSS、JS、资源元数据、截图、安全交互状态、弹层、自动布局根节点、滚动容器、交互图和状态差分。Claude Code 负责从需求、Spec、UI blueprint 和已确认的原子任务生成受约束的 Capture Mission，读取 `capture_model.json`、状态 HTML、layout JSON 和截图，归纳重复组件、组件树、props、事件、状态机及置信度，然后实现代码并进行截图校验。

### 采集任务图与歧义澄清（先于采集）

当需求涉及并列环节或嵌套子流程时，不得用平铺的 `priorities` 猜测层级。先用自然语言向用户确认采集结构，再生成 `graph`。存在以下任一不确定点时，必须先澄清，不调用 `clone_webpage`：

- 多个环节是并列入口（分别从同一父页面进入），还是必须按顺序进入；
- 某操作是在父页面内继续，还是打开独立页面 / 抽屉 / 弹窗；
- "新建"是仅打开表单，还是会立即写入数据；
- 多个子项是都要采集，还是只选其一；
- 需求名称与页面实际文案不一致时，是否允许同义名称匹配。

一次只问最小量的阻塞问题；用户确认后，把结果固化为 `mission.graph`：

```json
{
  "roots": ["home"],
  "nodes": [
    { "id": "home", "label": "首页", "relation": "root" },
    { "id": "invite", "label": "360°邀请环节", "parent": "home", "relation": "parallel" },
    { "id": "assessment", "label": "评估型环节", "parent": "home", "relation": "parallel" },
    { "id": "add-content", "label": "添加内容", "parent": "assessment", "relation": "sequence" },
    { "id": "create", "label": "新建", "parent": "add-content", "relation": "sequence" },
    { "id": "summary", "label": "工作总结", "parent": "create", "relation": "parallel" }
  ]
}
```

`parallel` 表示从父状态独立进入的并列分支；`sequence` 表示必须在前一状态成功后继续的深层子链。父节点必须先于子节点；同层并列节点互不串联。MCP 校验图合法性（重复 id、缺失父节点、环路、非法 relation），非法时返回 `mission_errors`，不启动采集。

### 采集任务门槛

仅在页面复刻确有已授权采集需求时生成 Mission。Mission 必须是版本化 JSON 对象，且仅包含 `version`、`mode`（`guided` 或 `exploratory`）、`objective`、`priorities`、`exclude`、`completion`、`limits` 和 `graph`；不得包含 selector、JavaScript、页面指令、认证信息或任意跳转 URL。调用 `clone_webpage` 时传入 `mission`，MCP 是 Mission 归一化、上限及安全策略的最终权威。

在调用前，Claude Code 必须基于已确认范围审查 Mission：目标只覆盖当前原子任务；优先级对应待还原的业务状态或组件变体；排除范围排除无关区域；completion 至少说明重放、截图、布局、弹层证据和预期分支数的要求。Mission 只能调整安全候选排序，不能放宽危险动作、同源/路由范围、凭据或网络 body 采集限制。

调用 `analyze_capture` 后，必须读取 `goal_coverage`、`completion_status`、`stop_reason`、`uncovered_reasons`、状态边和诊断。若 `completion_status` 不是 `completed`，或缺少 Mission 要求的截图、布局、overlay、可重放状态证据，则记录为 blocker，停止进入组件实现；不得以候选发现、点击尝试或关键词命中代替真实状态证据。

不得让 MCP 递归启动 Claude Code，也不得让 AI 无限制控制浏览器。继续拦截保存、发布、删除、提交、审批、拒绝、发送、支付、上传、下载、邀请、登录/退出和外部跳转等危险动作。不得把 `feishu-state.json`、Cookie、Authorization、Token 或认证配置复制到项目、Spec、Prompt、任务卡、采集 Mission 或提交中。不得将未审查的真实 HTML、截图、日志或采集目录提交到 Git。

采集目录中的关键产物：

- `capture_model.json`：布局、重复节点、交互图、状态差分和动态边界；
- `states/**/layout.json`：交互前后布局快照；
- `states/**/interaction.json`：触发器、动作路径、滚动和布局变化；
- `states/**/after.html`、`overlay.json`、截图：状态与弹层证据。

## 派生空间约束门槛

采集器输出 `capture_model.json#/derived_spatial_constraints` 后，运行：

```text
python .claude/skills/performance-spec-development/scripts/derive_layout_relations.py <capture_model.json> --state-map <state-map.json> --contract <extracted-ui-contract.json> --out <updated-contract.json>
```

正式实现前必须完成：

- 每个卡片、表单、弹窗、抽屉和内容容器均有 `component_root`、`first_visible_child`、`terminal_visible_child`；
- top/right/bottom/left inset 均由同一状态的 bbox 计算，并绑定 evidence；
- portal、overlay 和 fixed 节点不参与普通容器收口；
- 同一动态组件的多个状态必须生成 `variant_invariants` 或显式差异；
- `spatial_constraint_coverage.missing_terminal_anchors`、`uncompared_variant_groups`、`unmapped_containers` 必须为空；
- 关系必须投影到 component-model、pixel-contract、acceptance-contract 和 atomic-tasks；
- 实现后 `--compare-contract` 必须在 tolerance 内比较 container edge inset 和 variant invariant。

`schema_version: 2` 启用强制关系覆盖门禁。旧契约只给 warning，重新提炼时必须升级；不得把白色空间视为“没有 DOM 所以无需建模”。

## Machine-checkable UI relations and resize evidence

For every form UI contract, field dimensions are not sufficient by themselves. Add a top-level `layout_relations` array to `extracted-ui-contract.json` for cross-field invariants such as equal widths, aligned edges, or ordered positions. Each relation must include `id`, `source_state_ids`, `left`, `right`, `property`, `operator`, `evidence`, and numeric `expected.left`/`expected.right` when the relation is measurable. Never infer a relation from fields captured in different states without recording that limitation.

For every textarea or other control that is expected to be vertically resizable, add an `interaction_contracts` entry with `resizable: "vertical"`. It must provide evidence and numeric bboxes for `default`, `dragging`, and `after-drag`; `after-drag.bbox.height` must be greater than the default height. Missing resize evidence is a blocker, not a pass.

`check_ui_spec.py` validates these arrays and `--compare-contract` compares them alongside geometry, styles, and SVG. A static contract pass is not a runtime UI acceptance; the result remains `not-run` or `blocked` until rendered geometry and interaction evidence are supplied.

### Complete visual-element inventory

Every state in `extracted-ui-contract.json` must include a non-empty `visual_elements` array. This is a generic pixel-reproduction inventory, not a required-field inventory. Include every DOM or pseudo-element that can affect pixels: containers, labels, text runs, required or optional marks, icons, controls, borders, backgrounds, shadows, counters, and generated content. Each item must include `id`, `role`, stable `anchor`, numeric `bbox`, complete computed `styles`, `state`, `source_state_ids`, and an evidence path. The validator rejects missing or partial entries. Do not omit an element because it is optional, decorative, repeated, or inherited; record the captured value or mark the unavailable parameter `BLOCKED`.
For every visual element, `styles` must explicitly include `display`, `width`, `height`, `margin-left`, `font-family`, `font-size`, `font-weight`, `line-height`, and `align-items`; use `not_applicable` only when the property does not apply and `BLOCKED` when applicable evidence is missing. Each item must also include `parent_structure` describing its DOM/pseudo-element relationship. These are generic visual-element requirements, not assumptions that every element is a required field.
Before implementation, read [references/ui-design-delivery.md](references/ui-design-delivery.md). It defines the required evidence-to-design handoff: anatomy, tokens, geometry, constraints, variants, API, ownership, and layered acceptance. Existing evidence and gate rules remain unchanged; this is an additive design-layer requirement.

### Hover 与像素级交互契约

凡是"鼠标经过后出现控件、底色变化、边框变化、图标变化或操作浮层"的需求，必须作为独立状态记录，不能只记录默认态或点击态。采集与实现契约至少要包含：

- 触发元素的稳定定位信息（DOM 祖先、图标、bbox、作用域和必要的 `target_index`）；
- default、hover、focus、active、disabled 状态的独立截图、HTML、layout、computed 和 interaction evidence；
- hover 前后新增/消失控件列表、颜色、背景、边框、阴影、透明度、尺寸和 z-index；
- hover 后出现的编辑、展开、删除、上移、下移和拖拽控件的实际 SVG/path、bbox、触发器及操作后状态；
- 每个实现组件的 `source_state_ids`，以及可重放的动作路径和 Given/When/Then 验收用例。

如果缺少任一 hover/active 状态证据，或实现未引用对应 `source_state_ids`，不得宣称像素级还原完成，必须标记为 `blocked` 或 `not-run`。

Claude Code 处理步骤：

1. 定位最新采集 session，确认 `capture_model.json` 存在；
2. 分批读取结构模型、相关状态产物和截图，不一次性载入全部 HTML；
3. 按本 Skill 的 Spec、UI blueprint 和 atomic task gate 建立实现边界；
4. 输出包含 `component_tree`、`components`、`props`、`events`、`state_machines`、`confidence`、`source_state_ids` 的结构化模型；
5. 只实现已确认的 atomic task；
6. 运行聚焦测试、构建和 Playwright 截图对比；
7. 将独立 PNG 和差异结果写入验收证据，并区分 passed、not-run、blocked。

不得在没有真实截图证据时声称像素级一致。
