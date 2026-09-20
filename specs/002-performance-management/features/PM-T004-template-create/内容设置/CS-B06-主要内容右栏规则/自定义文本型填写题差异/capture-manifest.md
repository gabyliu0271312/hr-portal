# 自定义文本型填写题差异采集 Manifest

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. 会话与证据范围

本目录只记录工作总结环节中页面文案为“文本型填写题”的自定义文本型填写题差异，不复制原始证据。

| 用途 | realtime session | capture session | 证据根 |
| --- | --- | --- | --- |
| root default/display on/off 与 root binding | `realtime-57c95df92247` | `idreamsky.feishu.cn_20260904_151126_823218` | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_151126_823218` |
| item default/display on/off 与 owner isolation | `realtime-fb72a2e77342` | `idreamsky.feishu.cn_20260904_155422_606177` | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_155422_606177` |

- URL：`https://idreamsky.feishu.cn/perf/admin/templates/7680168681455815658/3`
- viewport：`1920×1080`
- DPR：`1`
- color scheme：`light`
- locale：`zh-CN`
- 两个 realtime 会话均使用新启动的 Perfect-Web-Clone-IDE MCP 进程；最终 item/owner 会话状态为 `completed`、`blocked_action_count=0`。
- 机器契约：[`extracted-ui-contract.json`](extracted-ui-contract.json)。

## 2. 绑定

| binding_id | 语义 owner | 结果 | 证据 |
| --- | --- | --- | --- |
| `work-summary-custom-text-root` | “文本型填写题”整卡 root | captured | root 证据根 `captures/target_bindings.json` |
| `work-summary-custom-text-item` | root 卡片内部“填写题名称”/编辑器 item | captured | item 证据根 `captures/target_bindings.json` |

binding 的视觉命中区是卡片的 design-mask；是否为 root/item 不以 overlay 节点名称判断，而以人工点击后的右栏 Profile、上下文和中栏 owner 联合确认。跨新浏览器上下文的旧 binding replay 曾出现 `target_not_found`，因此不能将跨上下文独立 replay 写成已通过。

## 3. 权威状态

所有路径相对于对应证据根：`captures/hybrid_steps/<step>/<before|after>/`。每个 primary after 目录应包含 `before_html`/`after_html`、`layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json`、`state_contract.json`、`state_fixture.json`、`interaction.json` 和截图；本项目只保存引用。

| source_state_id | 证据根 | after step | 事实 |
| --- | --- | ---: | --- |
| `custom-text-root-default` | `151126_823218` | 03 | root 默认；右栏仅显示“显示设置/隐藏描述” |
| `custom-text-root-display-on` | `151126_823218` | 08 | 勾选“隐藏描述”；描述及空间消失 |
| `custom-text-root-display-off` | `151126_823218` | 11 | checkbox 恢复 false；描述与空间恢复 |
| `custom-text-item-default` | `155422_606177` | 05 | item 默认；右栏显示“隐藏名称”、填写设置、必填项设置 |
| `custom-text-item-display-on` | `155422_606177` | 12 | 勾选“隐藏名称”；名称和星号消失，编辑器保留 |
| `custom-text-item-display-off` | `155422_606177` | 16 | checkbox 恢复 false；部分视觉/布局仍为约 250px，阻塞完整恢复结论 |
| `custom-text-owner-root` | `155422_606177` | 17 | root Profile |
| `custom-text-owner-item` | `155422_606177` | 18 | item Profile |
| `custom-text-owner-root-return` | `155422_606177` | 20 | 返回 root Profile |

## 4. 继承 CS-B06 的共享证据

以下不在本目录重复定义完整开关过程和基础 SVG：

- root/item 选择框与 owner 机制；
- item “在此环节填写/在此环节隐藏”；
- item “必填” checkbox 与必填星号联动；
- item 隐藏时灰态和 `VisibleLockOutlined`；
- radio/checkbox DOM role、checked/aria-checked 和 16px 几何；
- 右栏基础标题、分组、字号、宽度和布局；
- root→item→root 的共享隔离机制。

引用：[`../capture-manifest.md`](../capture-manifest.md)、[`../component-model.md`](../component-model.md)、[`../pixel-contract.md`](../pixel-contract.md)。

## 5. 安全边界

- 未点击保存、确定、下一步、提交、发布、删除、清空。
- 未写入模板或真实业务数据。
- 未采集 Cookie、Authorization、Token 或密码。
- 原始 HTML、截图和日志只保留在 `C:/Users/gaby.liu/ClonedSites/`。
- `item-switch-second-item`：`not_attempted`；目标页面没有第二个同类型 item，未创建或持久化第二项。

## 6. 当前门禁

- `capture_integrity=passed`
- `capture_completeness=passed`
- `implementation_readiness=design_incomplete`
- `readiness_scope=variant`
- `pixel_acceptance_status=not-run`

本目录可以作为事实契约和实现设计输入，但 item display-off 的视觉恢复、语义变体完整性和本轮 resize 证据未闭合前，不得标记 `ready_for_implementation`，不得进入正式前端实现门禁，不得声称像素验收通过。
