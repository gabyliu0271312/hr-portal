# PM-T004 验收标准

## Given/When/Then

### 正常流程

- Given 绩效管理员打开已保存模板草稿；When 页面加载；Then 显示项目启动、项目结束和接口返回的业务节点，右侧显示未选中空态。
- Given 选中评估型环节；When 修改名称、执行人和评估类型并点击下一步；Then PATCH payload 与表单一致，保存成功后进入内容设置。
- Given 两节点之间存在加号；When 点击加号；Then 插入一个评估型环节并自动选中。
- Given 选中结果复议处理环节；When 鼠标悬停“预览”；Then 约 118ms 后显示右对齐预览框，内容包含当前提示文案和由 `executor_config` 派生的执行人说明；When 鼠标离开按钮；Then 预览框立即消失。

### 已有周期

- Given `usage_summary.cycle_count = 1`；When 页面加载；Then 顶部显示影响提示，流程与数据写入字段禁用，仅参考/提示内容可编辑。
- Given 已有周期模板尝试 PATCH 锁定字段；When 后端校验；Then 返回 `TEMPLATE_WORKFLOW_LOCKED`，前端保留输入并显示错误。

### 权限与错误

- Given 用户无 `performance.admin` 或 `template.manage`；When 访问路由或 API；Then 路由拒绝或返回 403，不渲染可编辑画布。
- Given 节点顺序、系统节点或必填字段非法；When 保存；Then 返回 422 `TEMPLATE_WORKFLOW_INVALID`，页面定位错误字段。
- Given 并发保存冲突；When PATCH；Then 返回 409 `TEMPLATE_CONCURRENT_UPDATE`，提供重新加载而不覆盖本地输入。

## 必须执行的证据

- 前端：`npm.cmd run test -- src/views/performance/PerformanceTemplateWorkflowSettings.spec.ts`
- 构建：`npm.cmd run build`
- 类型检查：`npx.cmd vue-tsc --noEmit`
- UI 证据：`../../ui-blueprints/PM-T004-T02-F36-implemented-appeal-preview.png`
- E2E：Playwright 在 `1920x959` 运行初始态、选中、添加、删除、已有周期锁定和错误态截图。
- 后端：模板 workflow API、权限、审计和重新打开测试。
- 追踪：`UI -> PATCH payload -> service/database -> GET reopen`。

未执行的命令必须标记为 `not-run`，失败环境标记为 `blocked`，不得宣称通过。
