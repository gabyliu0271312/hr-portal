# PM-T003 首页采集 Manifest

- feature: `PM-T003-cycle-creation`
- target: 飞书绩效设置「周期与项目」首页
- URL: `https://idreamsky.feishu.cn/perf/admin/semester-activities?s=7671122266779814873`
- normalized URL observed by collector: `https://idreamsky.feishu.cn/perf/admin/semester-activities?s`
- completion_status: `incomplete`
- pixel_restore_status: `blocked`
- capture_integrity: `passed`
- capture_completeness: `incomplete`
- implementation_readiness: `ready` for `cycle-project-home-default`; `design_incomplete` for optional interaction variants
- readiness_scope: `variant`
- authority: `extracted-ui-contract.json`

## 1. 权威原始证据

基础采集目录：

`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_123515_419185/captures`

| 内容 | 路径 |
|---|---|
| 采集模型 | `.../captures/capture_model.json` |
| 首屏截图 | `.../captures/idreamsky_feishu_cn_perf_admin_semester-activities_s_7671122266779814873.png` |
| 计算样式 | `.../captures/computed_styles.json` |
| 像素证据 | `.../captures/pixel_evidence.json` |
| 静态设计证据 | `.../captures/static_design_evidence.json` |
| 1920 布局 | `.../captures/responsive/1920x1080/layout.json` |
| 1920 HTML | `.../captures/responsive/1920x1080/after.html` |
| 1920 截图 | `.../captures/responsive/1920x1080/after.png` |
| 1440 布局 | `.../captures/responsive/1440x900/layout.json` |
| 1366 布局 | `.../captures/responsive/1366x768/layout.json` |
| 1280 布局 | `.../captures/responsive/1280x720/layout.json` |

本目录不复制原始 HTML、截图或认证信息；以上路径保持为证据索引。

## 2. 状态证据索引

`source_state_id` 使用 session 前缀，避免不同补充会话中重复的 `hybrid-001-after` 发生歧义。每个状态的完整证据路径见 `extracted-ui-contract.json`。

| source_state_id | 语义状态 | 视口 | 完整性 |
|---|---|---:|---|
| `clone:base` | 默认首页 | 1920×1080×1 | yes |
| `hybrid:cycle-select:hybrid-001-after` | 点击周期「测试」后 | 1920×1080×1 | yes |
| `hybrid:cycle-search:hybrid-001-after` | 周期搜索输入 `2026` | 1920×1080×1 | yes |
| `hybrid:project-search:hybrid-001-after` | 项目搜索输入「项目」 | 1920×1080×1 | yes |
| `hybrid:nav-hover:hybrid-001-after` | 左侧「周期与项目」hover | 1920×1080×1 | yes |
| `hybrid:filter-hover:hybrid-001-after` | 项目筛选按钮 hover | 1440×900×1 | yes |
| `hybrid:filter-open:hybrid-001-after` | 项目筛选面板打开 | 1920×1080×1 | yes |
| `hybrid:responsive-1440x900:hybrid-000-after` | 桌面响应式快照 | 1440×900×1 | yes |
| `hybrid:responsive-1024x768:hybrid-000-after` | 小桌面响应式快照 | 1024×768×1 | partial |
| `hybrid:responsive-375x812:hybrid-000-after` | 窄视口快照 | 375×812×1 | partial |

## 3. 初始 clone 产物

初始采集模型记录：

- `sections_count`: 9
- `component_candidates`: 196
- `interaction_states`: 12
- `container_constraints`: 396
- `variant_invariants`: 132
- `capture_integrity`: passed
- `capture_completeness`: incomplete
- `implementation_brief.status`: design_incomplete

初始 clone 的 12 个 hover 状态具有结构和视觉产物，但部分状态缺少稳定语义目标映射，因此不直接作为业务变体契约。可作为后续补充证据，不得从 hover 编号推断控件归属。

## 4. 采集边界

允许：

- 读取页面结构、样式、资源元数据和截图。
- 点击已有周期项「测试」。
- 输入非敏感示例值 `2026`、`项目`。
- hover 导航和筛选控件。
- 打开可逆筛选面板。
- 采集多个视口快照。

禁止：

- 新建周期或项目。
- 保存、删除、发布、提交、审批、启动。
- 人员/部门同步或快照更新。
- 复制 Cookie、Authorization、Token 或 `feishu-state.json`。
- 把真实 API 数据当作前端 fixture 或业务契约。

## 5. 未解决缺口

1. 初始 mission 的必需交互没有在同一状态图中全部观察到。
2. 补充 hybrid 会话分别生成，realtime-session manifest 工具无法合并这些 hybrid session。
3. 表格横向滚动的独立 before/after 状态尚未形成。
4. 375px 和 1024px 是独立 viewport snapshot，不是 resize transition。
5. `MoreOutlined` path 在采集后处理中的标准化被标记为 `BLOCKED_PATH_NORMALIZATION`。
6. 筛选面板只记录打开状态，不记录应用筛选后的业务结果。

因此当前文档是 UI Expert 的 draft contract，不授权正式像素实现或像素验收。
