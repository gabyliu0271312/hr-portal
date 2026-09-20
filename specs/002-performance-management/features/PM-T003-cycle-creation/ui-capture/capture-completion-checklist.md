# PM-T003 首页采集完成清单

- completion_status: `incomplete` (global capture; target variant ready)
- pixel_restore_status: `blocked` (runtime pixel diff not yet run)
- implementation_readiness: `ready` for target variant `cycle-project-home-default`
- uncovered_reasons: 与 `extracted-ui-contract.json` 顶层保持一致

## 1. Readiness Gate

| 检查项 | 结果 | 证据/说明 |
|---|---|---|
| JSON、viewport、DPR、路径有效 | passed | `capture_model.json`；1920/1440/1366/1280 及补充 1024/375 证据存在 |
| 默认首页截图和布局 | passed | `clone:base` |
| 页面入口和首屏区域 | passed | Header、Sidebar、周期栏、详情区、项目设置区均有 layout/computed/screenshot |
| 周期切换 | passed | `hybrid:cycle-select:hybrid-001-after` |
| 周期搜索 | passed | `hybrid:cycle-search:hybrid-001-after` |
| 项目搜索 | passed | `hybrid:project-search:hybrid-001-after` |
| 导航 hover | passed（补充会话） | `hybrid:nav-hover:hybrid-001-after` |
| 筛选 hover | passed（补充会话） | `hybrid:filter-hover:hybrid-001-after` |
| 筛选面板打开 | passed（补充会话） | `hybrid:filter-open:hybrid-001-after` |
| 项目表横向滚动 before/after | blocked | 初始模型只有 hover 导致 scrollbar 可见的证据，缺少独立滚动动作契约 |
| 1024/375 resize transition | blocked | 只有独立快照，没有同一会话 resize 前后证据 |
| 所有 hover 状态语义归属 | blocked | 12 个初始 hover 状态部分缺少稳定 target 语义 |
| implementation brief | ready for target variant | `extracted-ui-contract.json#/variant_contracts/cycle-project-home-default`; optional variants remain out of scope |

## 2. 进入实现前必须补齐

- [ ] 将补充 hybrid 状态纳入统一状态 manifest，或在实现契约中明确 session 命名空间和证据边界。
- [ ] 为项目表执行可回放的横向滚动，获取 before/after/layout/computed/interaction/screenshot。
- [ ] 对默认、hover、focus、active、disabled 适用状态完成控件级矩阵。
- [ ] 标准化 `MoreOutlined` SVG path，或保留 BLOCKED 并禁止实现猜测。
- [ ] 确认移动/窄屏是保持桌面侧栏+横向滚动，还是存在重排；不能从独立快照推断。
- [ ] 将 `component-model.md`、`pixel-contract.md`、`acceptance-contract.md` 与 JSON 的变体和 blocker 对齐。
- [ ] 若开始实现，先由用户确认此 draft 契约的 UI 范围和上述缺口处理方式。

## 3. 明确不纳入本次门禁

- 真实周期和项目 API。
- 数据库、人员快照和权限实现。
- 项目新建、编辑、启动、复制、删除业务。
- 保存、发布、审批等危险操作。
- 真实项目成员和项目管理员数据。
