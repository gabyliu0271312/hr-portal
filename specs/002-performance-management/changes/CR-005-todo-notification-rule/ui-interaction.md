# CR-005 UI 交互 v1

## 确认记录

依据桌面 编辑待办任务通知.txt（指定/日/周三态，680×406 CSS px）和 png（日态）。2026-10-20 用户在组件/逻辑拆解后指示“缺失的地方暂不做像素级还原，根据已经采集的参数和上述的拆解完成开发”。本版本沿用该截图与拆解，不重新设计页面；未采集项以 spec.md 基础选项实现，不视为源系统确认。

关联 CR-005-T02/N01；路由 /performance/settings/system/notifications；编辑入口仅待办任务通知，另外两项编辑继续禁用。Portal performance.admin U 与 API performance.configuration.manage 保持分层，不扩大权限。

## 布局

PerformanceDialogShell，680px 宽，标题区72px，内边距24px，圆角8px。正文三组：频率、通知时间、屏蔽；组间20px，标题14px/600/24px，标签下间8px。通知行及下方时区行间10px。底部右对齐取消/确定，间12px。用全局 token，新增通知弹窗宽680px、单位区70px语义 token，不修改其他弹窗宽度。三态在无错误/额外提示时按采集高度自适应，不固定406px。

- 指定：环节截止前第 + 偏移天数多选 + 天（单选）+ HH:mm。
- 日：环节截止前每 + 数字及天后缀 + HH:mm。
- 周：环节截止前每 + 数字及周后缀 + 星期多选 + HH:mm。
- 共用：时区；屏蔽/不屏蔽。未知 tooltip 内容不伪造，保留说明入口采用本系统准确说明，不声称采集原文。

复用 DialogShell/RadioGroup/FormItem/SearchSelect/NumberInput/Button/PermissionButton。数字组件增加可选 suffix/showControls，保持旧用法不变。新建 TimeField 薄封装 ElTimePicker，纯时间字符串，时钟后置、弹层2201以上。新增业务弹窗，不拆三个频率子组件。不复用含日期的 DateTimeField，不重写 RRULE。

## 状态与行为

加载前不开放；GET失败沿用重试/403；打开深复制规则；频率切换保留各自草稿；取消/关闭丢弃；提交只校验当前分支，错误定位字段；PATCH中不可关闭或重复提交；失败保留输入并显示错误；成功以后端数据为准更新摘要并关闭；刷新和重开从GET回显。编辑保存不采用页面开关的提前乐观摘要更新。

基础选项非原系统还原，弹窗显示“配置保存后可回显，实际通知发送尚未接入”；未知调度起点/节假日日历/人员时区解析不执行。无空列表假数据、无真实消息发送。

键盘：初始聚焦频率、Tab保留弹窗/其浮层内、Esc优先关闭打开的下拉/时间层，随后关闭弹窗；关闭恢复编辑按钮焦点。窄屏频率换行、复合行分列，无横向页面滚动。

## 验收证据

2026-10-20：已在实际前端 Vite 5175 / 1534×911 浏览器中走查，API为隔离fixture（非真实数据库）。覆盖三态切换、多选、未选校验及修改后清除、纯时间弹层z-index=2201、失败不改摘要/保留输入、重试成功、刷新重开回显、390×844窄屏无页面横向溢出；无 pageerror。日态实际680×454（比采集多未接发送提示），周态选项换行自适应。已读取检查以下实际截图：

- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-daily.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-specified.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-weekly.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-time-picker.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-mobile.png

8个聚焦spec共39项通过；vue-tsc+vite build通过，仅现有@vueuse PURE注释警告。首次后端19项通过时尚未部署。

后续用户授权在容器内构建替换：已在本机 desktop-linux 开发容器构建并替换 frontend/backend，运行库升级至0261；隔离事务Schema验证迁移升降级、旧行默认值与JSONB回读通过（验证后回滚）。容器内19项通过（2个依赖弃用警告），/api/v1/health返回200、DB正常，nginx配置通过，部署后的SPA资源及OpenAPI均包含todo_task_rule，匿名API返回401。完整登录UI→真实API→DB→重开尚未验收，T01仍未勾选。未部署远程生产，未发送消息。
