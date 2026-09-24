# PM-T013 采集清单

- completion_status: incomplete
- pixel_restore_status: blocked
- capture_integrity: blocked
- capture_completeness: incomplete
- implementation_readiness: design_incomplete
- readiness_scope: variant
- target_variant_keys: `notification-default`, `notification-settings-container`
- source: `D:\乐逗\Desktop\通知设置.txt`
- `source_url`: `https://idreamsky.feishu.cn/perf/admin/system-setting/notify`
- SnapSpec 文本记录的视口：`1534×911`，未提供 DPR；第二张卡片报告尺寸 `1246×708px`。
- 先前浏览器脚本记录的视口：`1280×361`、DPR `1.5`；原始 JSON/HTML 已恢复并核验，不能与 SnapSpec 视口混作同一状态。
- 浏览器脚本状态标签：default、focus-1、focus-2、focus-3；未映射正式 source_state_id。
- `evidence`: `D:\乐逗\Desktop\通知设置.txt` 当前可读取；两个浏览器 JSON/HTML 文件已恢复并核验；文件路径与指纹记录在 extracted-ui-contract.json#/browser_observations。
- 浏览器默认态实际第二卡片根框：x=260、y=302、width=992、height=707.33；先前的 1280×305.33 是 `.page-content`，不是卡片。
- SnapSpec 是 HTML/CSS 参数摘录，未包含同状态 PNG、DPR、点击后状态或可重放采集包。
- `default` 状态包含通知设置策略容器、两组单选项和三项其他通知摘要；`focus-1` 至 `focus-3` 对应三个编辑按钮。

- 补充的取消勾选确认框为用户提供的 SnapSpec 片段（894×631）；标题、正文、SVG 和按钮结构已记录在 extracted-ui-contract.json#/supplemental_observations，尚无完整状态产物。

## 仍缺失

- 同一 session 下的 PNG 截图。
- 单选/复选切换后的 after 状态、编辑弹窗、保存失败与重开状态。
- 采集器认可的正式 `source_state_id` 映射和 rendered contract。
