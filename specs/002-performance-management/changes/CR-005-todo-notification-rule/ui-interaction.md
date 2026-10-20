# CR-005 UI 交互 v1

## 确认记录

依据桌面 编辑待办任务通知.txt（指定/日/周三态，680×406 CSS px）和 png（日态）。2026-10-20 用户在组件/逻辑拆解后指示“缺失的地方暂不做像素级还原，根据已经采集的参数和上述的拆解完成开发”。本版本沿用该截图与拆解，不重新设计页面；未采集项以 spec.md 基础选项实现，不视为源系统确认。

关联 CR-005-T02/N01；路由 /performance/settings/system/notifications；编辑入口仅待办任务通知，另外两项编辑继续禁用。Portal performance.admin U 与 API performance.configuration.manage 保持分层，不扩大权限。

## 布局

PerformanceDialogShell，680px 宽，标题区72px，内边距24px，圆角8px。正文三组：频率、通知时间、屏蔽；组间20px，标题14px/600/24px，标签下间8px。通知行及下方时区行间10px。底部右对齐取消/确定，间12px。用全局 token，新增通知弹窗宽680px、单位区70px语义 token，不修改其他弹窗宽度。三态在无错误/额外提示时按采集高度自适应，不固定406px。

- 指定：环节截止前第 + 偏移天数多选 + 自然日/工作日（单选）+ HH:mm。
- 日：环节截止前每 + 数字及天后缀 + HH:mm。
- 周：环节截止前每 + 数字及周后缀 + 星期多选 + HH:mm。
- 共用：时区；屏蔽/不屏蔽。未知 tooltip 内容不伪造，保留说明入口采用本系统准确说明，不声称采集原文。

复用 DialogShell/RadioGroup/FormItem/SearchSelect/NumberInput/Button/PermissionButton。数字组件增加可选 suffix/showControls，保持旧用法不变。T02初始TimeField薄封装ElTimePicker；T05依据时间补采改为ElInput/ElPopover加内部双列（详见v4），保持纯时间字符串、时钟后置、弹层2201以上。新增业务弹窗，不拆三个频率子组件。不复用含日期的 DateTimeField，不重写 RRULE。

## 状态与行为

加载前不开放；GET失败沿用重试/403；打开深复制规则；频率切换保留各自草稿；取消/关闭丢弃；提交只校验当前分支，错误定位字段；PATCH中不可关闭或重复提交；失败保留输入并显示错误；成功以后端数据为准更新摘要并关闭；刷新和重开从GET回显。编辑保存不采用页面开关的提前乐观摘要更新。

基础选项非原系统还原，弹窗显示“配置保存后可回显，实际通知发送尚未接入”；未知调度起点/节假日日历/人员时区解析不执行。无空列表假数据、无真实消息发送。

键盘：初始聚焦频率、Tab保留弹窗/其浮层内、Esc优先关闭打开的下拉/时间层，随后关闭弹窗；关闭恢复编辑按钮焦点。窄屏频率换行、复合行分列，无横向页面滚动。

## 天数多选补采 v2（CR-005-T03）

2026-10-20 用户提供 `D:\乐逗\Desktop\指定通知-天数选项与勾选显示.json`，并明确要求“根据采集参数完成开发”。本次仅补齐指定模式第一个天数多选，不改页面信息架构，不需新建完整蓝图。

- 44 个快照、61 条滚动事件，累计采到75个不同数字，包含1与100；未逐项采齐100项。源采用虚拟列表，总高3200px，视口240px，行步长32px，当前源浮层宽165px。
- 提供纯数字1..100；旧配置0或101..365额外加入，避免重开丢值。API范围与数据库保持不变。
- 整行点击多选，右侧对勾，无左侧方框；选择不关闭。输入框已选项显示可删除数字标签；再次点击已选行或标签关闭按钮均移除；关闭再开保留本次草稿。
- 源DOM的 +0 容器被隐藏，不显示。超宽标签折叠未采实，沿用现有多选换行与窄屏适配，不推断 +N 折叠规则。
- 复用 PerformanceSearchSelect，通过默认关闭的可选展示变体限制作用范围；默认调用、星期、时区和其他页面不变。100项采用现有滚动机制，不为还原第三方虚拟列表内部结构引入新库。高度、行高、标签和选中态使用现有token，不照搬源z-index或修改全局主色。
- 验收：范围、滚到底、多选/反选/标签删除、展开保留、取消丢弃、旧值回显及默认下拉回归；组件测试、构建、实际前端浏览器与独立截图。截图计划 `../../ui-blueprints/CR-005-T03-implemented-todo-days-selected.png`。

## 日期类型修正 v3（CR-005-T04）

2026-10-20 用户明确第二个下拉为自然日/工作日，不是原暂定“天”；浮层与右侧勾选视觉沿用第一处，day_kind仍是单选。复用同一SearchSelect与SelectShell，选项32px行高、两项自适应高度、右侧对勾仅标当前选项，选择后关闭，输入框显示中文而非可编辑文本。保留既有弹窗尺寸/时区/草稿/取消/保存状态，工作日与节假日屏蔽独立；仅保存配置，不接调度或日历。默认自然日、旧值语义不变；保存摘要区分“第N个自然日/工作日”。验证单选替换、取消不写、错误保留、刷新回显、第一处多选回归及窄屏。独立实现PNG：../../ui-blueprints/CR-005-T04-implemented-todo-day-kind.png。

## 时间补采 v4（CR-005-T05）

2026-10-20用户提供时间浮层JSON并要求完成开发。24快照、86 scroll/76 wheel事件，双70px列/240px视口，小时00..23、分钟00/30，行本体30px/步长32px/底部208px留白；小时scrollTop0..736，分钟0..32。8px原生滚动条，透明轨道，滑块圆角10px，悬停时rgba(31,35,41,.6)。未采到拖条按下/抬起及点击回填，因此不能声称源行为已确认。

复用Element Plus ElInput/ElPopover负责输入和浮层定位/外部关闭，以TimeField内双列代替原ElTimePicker（后者分钟范围、中心滚轮和底部按钮与采集不符）；不修改第三方库，不新增组件或依赖。使用已有token加时间列宽/视口/滑块色语义token，不复制源z-index1050，保持2201。小时与分钟独立滚动，滚动不更改草稿；点击只更新该部分HH:mm，保持浮层展开（本地约定），Esc/外部点击关闭；Tab限制于输入及两列，方向/Home/End选值，disabled禁止编辑。兼容已有09:05等非半点值，分钟额外保留当前旧值，不静默取整；API和数据精度不变。源选中伪元素未采实，采用本系统选中token。截图CR-005-T05-implemented-time-{panel,scrollbar,mobile}.png；不得以fixture代替真实DB验收。

## 日报复用 v5（CR-005-T06）

2026-10-20用户要求整体复用并仅修改标题，视为对现有v1–v4弹窗在日报入口的复用确认；不新建页面或重做蓝图。日报编辑标题为“编辑绩效进度日报通知”，同一弹窗实例按编辑目标传标题与独立规则；待办默认标题不变。日报初始18:00，其他默认沿用，三态和所有草稿/取消/校验/保存失败/禁用/关闭恢复焦点行为一致。日报摘要读取progress_daily_rule，仅PATCH该规则，不串改待办。环节启动编辑继续禁用。周模式星期已按用户要求采用右勾多选（补充T03当时默认方框的历史记录，不修改历史证据）。

权限、路由、token不变；遵循Spec012 N000/N00/U00通用状态与复用约束，不修改数仓领域任务。独立验收PNG：../../ui-blueprints/CR-005-T06-implemented-progress-daily-{dialog,mobile}.png。真实登录DB链路单列验收，不以fixture替代；无调度、统计、发送或部署。

## 验收证据

2026-10-20 T05：`PerformanceTimeField.spec.ts`、通知弹窗/摘要/卡片及页面5个spec共44 passed。首次测试误对子组件调用setProps导致4项失败，修正为组件事件打开浮层后复跑通过；浏览器发现flex未启用造成行距/总高偏差、Tab被Element Plus内部处理抢先，均已修正并实测。最终`npm --prefix hr-portal/frontend run build`类型检查及Vite构建通过（1m3s，仅现有@vueuse PURE注释警告）。

实际Vite5175 + Playwright + 隔离API fixture：列宽70px/高240px、30px行/32px步长、208px尾白、总高976/272、初始10:00定位scrollTop320/0；独立滚轮到736/32且不改值。headless为覆盖式滚动条、指针未命中，未以此宣称拖动通过；改用可见Chromium，实测8px滚动条占宽（client62/offset70），拖动小时滑块从736到0且时间不变，通过。点击时间、Home/End/方向键、Tab输入→小时→分钟循环、Esc先关浮层再关业务弹窗、外部点击关闭、取消不PATCH、失败保留09:30/重试、fixture刷新回显、三种频率共用控件、旧09:05仅改小时保留05、390px无页面横溢均通过，无pageerror。已生成并读取T05 time-{panel,scrollbar,mobile}.png真实截图；本地浮层外框142×246px（源142×245.33），未锁源缩放产生的小数边框。未运行真实登录DB联调、未发送、未部署此次更新。

2026-10-20 T04：后端通知24 passed（1依赖警告）、前端6个spec共55 passed、vue-tsc+vite构建通过（仅现有@vueuse PURE警告）。实际Vite5175+隔离API fixture浏览器验证第二下拉只读、两项单选、唯一右勾、32px行/64px浮层/2201层级，取消不写、失败保留草稿与原摘要、重试成功、刷新重开工作日回显，第一多选不变，390px无页面横向溢出，无pageerror。已生成并读取 `../../ui-blueprints/CR-005-T04-implemented-todo-day-kind.png` 与 `../../ui-blueprints/CR-005-T04-implemented-todo-day-kind-mobile.png`。无迁移，未部署本次更新；真实登录DB全链路仍未验收，工作日日历与发送未实现。

2026-10-20 T03补采实现：11个spec共84项通过，vue-tsc + vite构建通过，仅现有@vueuse PURE注释警告。真实Vite5175浏览器 + 隔离API fixture测得100项、240px视口、32px行、3200px内容与底部scrollTop2960；当前桌面浮层宽172.66px（跟随字段宽，不固定源165px）。已验多选右勾、标签删除、反选、关闭重开、取消不PATCH、确认仅todo_task_rule、fixture刷新回显、旧0/150/365兼容、星期默认不变及390px无页面横向溢出，无pageerror。已生成并读取 `../../ui-blueprints/CR-005-T03-implemented-todo-days-{selected,bottom,mobile}.png`。未采用源虚拟化库，使用现有100项滚动；未验证超宽标签源折叠规则，保留原换行。未部署此次更新，未做真实登录API/DB全链路；无发送。

2026-10-20：已在实际前端 Vite 5175 / 1534×911 浏览器中走查，API为隔离fixture（非真实数据库）。覆盖三态切换、多选、未选校验及修改后清除、纯时间弹层z-index=2201、失败不改摘要/保留输入、重试成功、刷新重开回显、390×844窄屏无页面横向溢出；无 pageerror。日态实际680×454（比采集多未接发送提示），周态选项换行自适应。已读取检查以下实际截图：

- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-daily.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-specified.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-weekly.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-time-picker.png
- ../../ui-blueprints/CR-005-T02-implemented-todo-notification-mobile.png

8个聚焦spec共39项通过；vue-tsc+vite build通过，仅现有@vueuse PURE注释警告。首次后端19项通过时尚未部署。

后续用户授权在容器内构建替换：已在本机 desktop-linux 开发容器构建并替换 frontend/backend，运行库升级至0261；隔离事务Schema验证迁移升降级、旧行默认值与JSONB回读通过（验证后回滚）。容器内19项通过（2个依赖弃用警告），/api/v1/health返回200、DB正常，nginx配置通过，部署后的SPA资源及OpenAPI均包含todo_task_rule，匿名API返回401。完整登录UI→真实API→DB→重开尚未验收，T01仍未勾选。未部署远程生产，未发送消息。
