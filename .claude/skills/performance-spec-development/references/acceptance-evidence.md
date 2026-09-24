# 验收证据

每个任务在适用处必须有可执行的 Given/When/Then 覆盖：

- 成功和校验失败；
- 空或缺失资源；
- 权限允许/拒绝；
- 非法状态流转；
- 并发更新和乐观锁冲突；
- 周期开始快照和历史数据边界；
- 旧数据读取/重开/写入和未知字段保留；
- 有损写入阻断；
- 回滚；
- 敏感数据脱敏；
- 外部失败、重试、幂等、审计和通知去重。

标注真实测试文件和命令。缺失文件、跳过测试、不可用环境、未运行命令都记为 `未运行` 或 `被阻塞`，绝不算通过。

## 像素级 UI 验收

像素级 UI 的每个必需状态必须记录：`source_state_id`、目标截图、实现截图、viewport、DPR、浏览器/字体环境、数据夹具、动作路径、截图区域、差异结果和产物路径。上述状态证据必须先进入 `extracted-ui-contract.json`，再由 `component-model.md`、`pixel-contract.md` 和 `acceptance-contract.md` 引用；不能只在 Markdown 中手工摘要。验收命令必须真实存在；项目未配置截图运行器时标记 `blocked`，不得只写“视觉截图对比”。

逐项验证：页面骨架、bbox、间距、字体、颜色、边框、圆角、阴影、SVG/path、hover/focus/active/disabled、弹层、滚动、overflow 和 z-index。未定义差异算法或容差时不得给出像素通过结论；抗锯齿容差不得掩盖结构或颜色错误。

关系级验收必须覆盖每个视觉容器的四边 inset、first/terminal visible child，以及动态组件的跨状态不变量。至少断言 `container.bottom - terminal.bottom`、首内容到顶边、左右内容边界；目标值来自 `container_constraints` / `variant_invariants`，实现值来自 rendered contract。只有元素截图而没有关系测量时，布局验收为 `not-run`。

验收结果必须与 `capture-completion-checklist.md`、`component-model.md` 和 `acceptance-contract.md` 一致。任一必需状态无完整证据、目标截图或可执行命令时，统一为 `pixel_restore_status: blocked`。

## 完成阻塞项

当任一必需任务缺证据、权限缺允许/拒绝覆盖、历史快照可被静默重写、适配器丢字段、迁移升级/降级未验证、必需 UI 蓝图未确认、或 P0/P1 矛盾仍存在时，不得宣称完成。

## 验收追踪

对持久化敏感工作验证：

```text
UI → 实际 API 载荷 → 服务/数据库 → 读取/重开
```

在范围涉及这些关注点时，同时验证状态流转、权限和外部重试。分别报告通过、未运行和被阻塞的检查。
