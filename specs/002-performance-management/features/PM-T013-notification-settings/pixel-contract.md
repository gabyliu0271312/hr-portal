# PM-T013 像素契约

- completion_status: incomplete
- pixel_restore_status: blocked

## 已确认目标值

- viewport：894×631，DPR 未提供。
- 卡片：712×168px，padding 20px，radius 8px，white background。
- 标题：16px、600、24px、`#1F2329`。
- 描述：14px、400、22px、`#646A73`。
- checkbox：16×16px；label gap 8px；helper margin-left 24px；helper 12px/22px。
- checked SVG：12×12px，path 来自采集文件 `M9.589...`。

## 通知设置策略容器采集值

- source session：`pm-t013-browser-2026-09-23T07-01-19-124Z`；viewport `1280×361`；DPR `1.5`；第二卡片根框 x=260、y=302、992×707.33px（浏览器 JSON 默认态 layout 观察，非目标截图比较）。
- 单选选项：`实时发送`、`校准结束后合并发送`；`仅在终评绩效结果（评分评级）发生变更时通知`、`任意内容发生变更时通知`。
- 其他通知项：`待办任务通知`、`绩效进度日报通知`、`环节启动通知`，默认均选中。
- 摘要卡：`#F5F6F7` 背景、8px 圆角、16px 水平 padding、12px 垂直 padding；编辑按钮 54×22px。

## 未完成比较

原 894×631 采集缺少 DPR；补充的 1280×361 浏览器状态 DPR 为 1.5，原始 JSON/HTML 已恢复，但仍缺少目标截图、正式 source_state_id、运行时 rendered contract、容器四边关系及交互状态截图。因此 geometry/style 仅作为实现参考，不能用于宣称 pixel pass。

## 取消勾选确认框（补充的 SnapSpec 摘录）

- 894×631 视口（DPR 缺失）；header 420×103px、padding 24px；footer 420×56px；确定/保留按钮各 80×32px。
- 标题 16/600/24、正文 14/400/22、正文左缩进 40px；warning SVG 24×24、`#FF811A`，路径见 `extracted-ui-contract.json#/supplemental_observations/warning_icon`。
- 未提供整态截图与正式 source_state_id，以上不能用于声明像素验收。
