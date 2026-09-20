# PM-T004 内容设置采集 Manifest

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 统一 manifest 已收口 10 个 session，但其中部分 session 正确保持 incomplete/stopped/running，不能改写为 completed。
- 工作总结“更多”菜单入口已采集，菜单内容未展开。
- “设置分组”中的“请选择评估内容”选项弹层未稳定打开。
- 自定义文本/标签已完成弹窗和抽屉回填，但最终抽屉确定后的中栏卡片 root/item、hover、四按钮和右栏联动缺少 after 证据。
- 本轮未补采新增分支的完整 focus/active/disabled、resize、键盘和响应式矩阵。
- 未保存、删除、提交目标模板；原始 HTML、截图、日志和认证信息不进入仓库。

## 1. 统一证据

- Manifest：`C:/Users/gaby.liu/ClonedSites/realtime_sessions/manifests/PM-T004-content-settings-20260901-50f0f4d0.json`
- 权威九环节 session：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260901_183638_272038`
- 存量内容/抽屉 session：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260901_154507_753944`
- 卡片 root/item 与操作条 session：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260901_164618_262168`
- 工作总结双层设置 session：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260901_194710_752022`
- 自定义文本/标签 session：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260901_202716_060016`

| 指标 | 值 | 语义 |
| --- | ---: | --- |
| 关联 session | 10 | `missing_session_ids=[]` |
| 完成动作 | 120 | 来自统一 manifest |
| blocked 动作 | 17 | 保留精确 blocker，不转为未发生 |
| 持续录制事件 | 594 | 包含 partial action log |
| 缺失证据目录 | 0 | 不能据此推导 feature 完整 |

## 2. Session 状态

| session | 状态 | 完成状态 | 计划/完成/blocked/事件 | 作用 |
| --- | --- | --- | ---: | --- |
| `realtime-c410fb70178f` | completed | completed | 1/3/0/6 | 三环节基线与评估型默认 |
| `realtime-578577864f34` | completed | completed | 19/19/0/99 | 旧有内容/右栏参考状态 |
| `realtime-9cd771692659` | stopped | incomplete | 4/3/1/69 | 卡片整层，用户停止后保留证据 |
| `realtime-61c12d88a1fa` | incomplete | incomplete | 7/2/5/161 | 操作条，自动定位失败但人工 hover 可信 |
| `realtime-c4d2d08187cf` | incomplete | incomplete | 20/18/2/4 | 抽屉、可见性开关、分组 |
| `realtime-de9d5a00c734` | incomplete | incomplete | 33/32/1/4 | 权威九环节矩阵；唯一 blocker 为“更多” |
| `realtime-1b99b2cdfb49` | stopped | incomplete | 7/6/1/70 | 独立分段补采，保留 stopped 语义 |
| `realtime-72559dd43149` | completed | completed | 8/8/0/3 | 工作总结 root/item 人工可信事件 |
| `realtime-72d743fc6fd0` | running | not-finalized | 10/8/1/71 | 自定义文本编辑器，续采前状态 |
| `realtime-51c3b7d38eb6` | running | not-finalized | 28/21/6/107 | 自定义标签、回填与 lineage 续采 |

## 3. 权威状态登记

所有状态都必须引用 `extracted-ui-contract.json` 中同名 `source_state_id`。每个已收录状态的 artifacts 至少包括 `before_html`、`after_html`、`layout`、`computed`、`target_contract`、`interaction_evidence` 和 `screenshot`；状态是否完整以证据包和 `state_contract` 为准，不以 session 顶层状态替代。

| 状态范围 | source_state_id | session | viewport/DPR | 结果 |
| --- | --- | --- | --- | --- |
| 全局三栏基线 | `base` | `realtime-c410fb70178f` | 1280×673 / 1.5 | captured |
| 360°邀请 | `ALL9-360-INVITE-FILL`、`ALL9-360-INVITE-REFERENCE` | `realtime-de9d5a00c734` | 1920×1080 / 1 | captured |
| 360°确认 | `ALL9-360-CONFIRM-FILL`、`ALL9-360-CONFIRM-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 360°评估人 | `ALL9-EVAL-360-FILL`、`ALL9-EVAL-360-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 校准 | `ALL9-CALIBRATION-ADJUSTMENT`、`ALL9-CALIBRATION-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 结果沟通 | `ALL9-RESULT-COMMUNICATION-FILL`、`ALL9-RESULT-COMMUNICATION-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 直属上级评估 | `ALL9-EVAL-MANAGER-FILL`、`ALL9-EVAL-MANAGER-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 绩效结果查看 | `ALL9-RESULT-VIEW` | 同上 | 1920×1080 / 1 | captured |
| 结果复议处理 | `ALL9-RECONSIDERATION-FILL`、`ALL9-RECONSIDERATION-REFERENCE` | 同上 | 1920×1080 / 1 | captured |
| 工作总结更多 | `ALL9-WORK-SUMMARY-MORE` | 同上 | 1920×1080 / 1 | blocked | 入口存在，菜单未展开 |
| 抽屉与分组 | `C10-DRAWER-OPEN`、`C10-VISIBILITY-SWITCH-ON`、`C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED`、`C10-GROUP-DIALOG-CANCEL` | `realtime-c4d2d08187cf` | 1280×673 / 1.5 | partial/captured |
| 卡片 root/item | `C20-CARD-ROOT-SELECTED-CLEAN`、`C20-CONTENT-BODY-SELECTED-DIAGNOSTIC` | 多 session | 1280×673 / 1.5 | captured/partial |
| 操作条 | `C20-CARD-HEADER-HOVER`、`C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER`、`C20-TOOLBAR-EDIT-HOVER`、`C20-TOOLBAR-DELETE-HOVER` | `realtime-61c12d88a1fa` | 1280×673 / 1.5 | captured | 人工可信 hover |
| 工作总结双层设置 | `TYPE-WORK-SUMMARY-ROOT-TOP-CLICK`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` | `realtime-72559dd43149` | 1280×673 / 1.5 | captured |
| 自定义文本 | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TEXT-CONFIRM-RESUMED` | `realtime-72d743fc6fd0` / lineage 续采 | 1280×673 / 1.5 | captured/partial |
| 自定义标签 | `CUSTOM-TAG-MODAL`、`CUSTOM-TAG-CONFIRM` | `realtime-51c3b7d38eb6` | 1280×673 / 1.5 | captured |
| 自定义最终确定 | `DRAWER-CONFIRM-CUSTOM-ITEMS` | `realtime-51c3b7d38eb6` | 继承 session viewport | blocked | 未取得中栏 after |

## 4. 语义和安全边界

- `captured`：有完整 before/after、layout、computed、target contract、interaction evidence 和 screenshot。
- `partial`：结构或行为可信，但存在像素污染或某层证据不足。
- `blocked`：已尝试且明确失败，必须保留失败原因和诊断。
- `not_attempted`：尚未执行，不等于失败。
- `stopped`、`running`、`incomplete` 是会话生命周期事实，不得被汇总为完成。
- `1111 / 年度综合评级` 归属评分评级；`名称 / 描述 / 填写题名称 / 富文本框` 归属工作总结。旧 rating/work-summary 误标证据为 superseded。
- 删除、确认、保存、提交等动作由人工确认；本轮没有执行目标模板保存、删除、发布或提交。
- `TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` 的人工事件是下半内容项右栏的权威来源；透明 mask 自动重放不作为像素依据。

## 5. 后续补采顺序

1. 自定义文本/标签最终确定后，中栏 `ConfiguredContentCardRoot` 与 `ConfiguredContentItem` 的 default、上半 hover、四按钮、整卡点击和下半点击。
2. 工作总结“更多”菜单展开内容。
3. 设置分组评估内容选择器选项弹层。
4. 新增共享控件的 focus/active/disabled、键盘和响应式状态。
5. 内容设置 textarea 的 default/dragging/after-drag resize 证据。
6. 重新运行规格门禁，再由用户确认 UI Implementation Brief。
