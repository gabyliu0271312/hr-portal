# CR-009 填写任务双屏/全屏模式

- 状态：主体及上一轮高度修复已提交推送；本轮目标白卡/底栏结构、滚动终点与参考空态纠偏已完成本地验收，未提交/部署。
- 蓝图：`ui-blueprints/CR-009-T01-write-modes-v1.md` v1 已于2026-11-01确认
- 关联：CR-008 模板驱动的全屏绩效填写工作区
- 改动仅前端，不修改API、数据库、后端、权限或周期快照。

## 原子任务

- [x] CR-009-T01 模式按钮、四态SVG、弹窗及偏好：组件与存储测试、实际菜单截图完成。
- [x] CR-009-T02 双栏布局与分隔线：容器边界/清理/ResizeObserver/键盘测试与实际拖动截图完成。
- [x] CR-009-T03 任务接入、状态不丢失及回归：108项定向测试、构建和实际Vue路由fixture验收完成。仅前端范围；真实数据库及生产不在完成声明内。

## 已实现

- `PerformanceWriteModeSwitch.vue`：顶部切换按钮和模式弹窗；REA片段中提取的4种原始 SVG 作为独立静态资源；选中/hover/pressed/展开状态；Escape、外部关闭、焦点返回、键盘选择、ARIA状态；尺寸变化定位和过渡。
- `PerformanceSplitWorkspace.vue`：双面板；默认60%，offset=-3px；实际容器尺寸测量；左右最小524px约束；6px splitter/4px手柄/4×20三点；33ms pointer增量节流、body事件、mouseup/blur/卸载清理和flush；ResizeObserver；键盘 Home/End/左右键；localStorage偏好保护。
- `usePerformanceWriteMode.ts`：首次无偏好/非法mode默认basicWriteMode（按用户确认）；两个独立key分别存mode与offset；访问异常可继续内存操作。
- Header actions slot和 SelfSummaryTask layout 接线。全屏/双屏切换使用同一任务/form/reference/footer DOM，切换不reload、无答案/dirty/error/版本重置且没有额外网络写请求；双屏左侧仅用 reference_tabs；空参考有明确空态；窗口宽不足1061px临时全屏显示而保留双屏偏好，足宽恢复双屏。
- CR-009-T01蓝图和CR-009变更任务记录已更新。

## 验收证据

- 前端测试：9个定向文件，108 passed。包含mode/offset合法与异常localStorage、四态选择卡、菜单焦点及键盘、拖拽上下限/键盘/resize/blur/unmount/body样式恢复、窄屏恢复、任务表单实例/答案/错误/提示/版本和save chain无丢失、无引用空态、身份续期及旁路页面回归。
- 前端 `vue-tsc --noEmit` + Vite production build通过；仅有依赖内既有 VueUse `#__PURE__` Rollup提示。
- 实际本地Vue页面 + API fixture浏览器：默认双屏；切换前后renderer/editor DOM相同；切换无API调用；鼠标拖动左宽743→660px；524px/Home与End边界；1920视口弹窗293.33px；390视口document横向溢出为0、模式仍记为双屏且展示回退全屏；扩大窗口恢复双屏；草稿fixture重开/提交、payload不含参考字段；0 pageerror。
- 独立实现截图：`CR-009-T01-implemented-mode-menu.png`、`CR-009-T02-implemented-split-drag.png`、`CR-009-T03-implemented-narrow.png`。
- 证明范围：截图和API读写是本地fixture；不是实际业务数据库或生产持久化验收。

## 非完成项与边界

- 无真实数据库/真实业务API持久化和生产验收；没有修改后端/迁移；本轮高度修复未部署、提交或推送。
- REA生产代码静态分析与几何采集支持参数选择；本地原始svg作为静态资源，生产代码从未执行。
- 模式与分隔比例是个人显示偏好，不是权限或业务数据；本地窄屏回退是CR-009适配规则。
- 旧CR-008只默认全屏、未放模式切换入口的文字边界由用户确认的CR-009 v1扩展覆盖；不改变其表单schema/answer/Renderer/snapshot基线。

## CR-009-T03 白色画布高度回归修复（2026-11-01）

- 问题：草稿/提交后查看功能新增 `draftAnchor` 普通包装层，打断当前填写器的 flex 高度链；全屏参考页签缺少独立白卡，双屏参考的百分比最小高度和收缩规则也未形成稳定的短/长内容约束。
- 修复：`SelfSummaryTask.vue` 的 `task-form-shell` 与填写器使用 `flex:1 0 auto` 连接高度链；全屏/双屏参考共用局部 `task-reference-content` 白色画布和20px内边距；参考滚动容器纵向布局，短内容撑满、长内容自然增长，参考未提交/过滤为空的空态在可用画布内居中。未给公共Renderer或抽屉添加全局固定高度；参考共享组件未改动。
- 回归：`npm --prefix hr-portal/frontend test -- src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceSplitWorkspace.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/views/performance/Review.spec.ts --silent`，4文件155 passed，其中本轮新增7项。未静默运行时相邻Review测试有既有 `loading` 指令mock警告。
- 构建：`npm --prefix hr-portal/frontend run build` 通过（vue-tsc + Vite）；只有既有VueUse PURE annotation提示。
- 真实本地Vue路由 + 拦截API fixture：12组浏览器几何断言通过。1280×900下全屏短填写白卡688px、参考白卡752px；双屏右侧短填写白卡748px、左参考752px。长填写4352px、长参考2542px，均可滚动到末项，footer保持在900px底部；参考未提交/过滤空、无参考及390×844窄屏回退通过，两个正式任务路由均无横向溢出，双屏偏好保留；pageerror=0，API写请求=0。
- 独立实现截图（本地夹具，非生产）：`ui-blueprints/CR-009-T03-implemented-canvas-height-dual.png`、`ui-blueprints/CR-009-T03-implemented-canvas-height-reference.png`、`ui-blueprints/CR-009-T03-implemented-canvas-height-narrow.png`。
- 边界：仅页面布局、既有测试与本记录；模板参考投影、答案、保存链、服务端权限、数据库及生产均未修改。

## CR-009-T03 目标白卡与底栏结构纠偏（2026-11-01）

- 用户补充的验收口径覆盖上一轮“各自撑满即可”的结论：必须同时验证填写白卡/按钮区同宽、双屏左右白卡共同底边、长参考滚到底后的终点，以及参考空态标题与插画。上一轮688px/748px填写高度和独立全宽footer只是当时本地实现证据，不代表与目标结构一致。
- 目标依据：REA页面 `.../perf/review/7702053437998894368/7311617673744662556?mode=editable`，截图证据 `ev_d94ea927373f66ec7e26781097839856b97a5c0ebae306ce7aee5237806ec015`；已保留生产bundle证据 `ev_53557936f18942737271c50af69249782be40670a6104c484aa8a80ce331a03f` 的 `SplitScreenContainer__RightScreen` / `FullScreenMode` 和footer规则，补充同CDP目标只读几何测量。按钮区“底部”按外框理解，非32px按钮本体底边：当次CSS视口约1280×673.33（DPR1.5），左右白卡/底栏外框底边均661.33，按钮本体底边645.83。
- 实现：稳定的 `split-current-card` 同时包含当前内容滚动层和footer；双屏整卡外边距12px、白底、圆角8px，表单与footer共用宽度；左参考空/短内容撑到相同底边，长参考自然增长并在独立滚动层滚到底后对齐。单屏footer固定在工作区底部，画布不再先扣除footer高度；额外的滚动尾部按ResizeObserver实测footer高度预留（桌面63px、窄屏实测85px），避免末项被遮挡。
- 参考标题在readonly内容/空态分支外显示，包含pending/overdue/not_started/completed但过滤为空；现有抽屉自行提供标题，因此不启用参考组件的 `showTitle`，避免重复。工作总结和参考未提交状态共用完整6-path静态插画 `public/performance-no-submit.svg`，不再复制不完整的3-path SVG；未启动继续共用原 `performance-not-started.svg`，不混淆业务状态。
- 复用与边界：Renderer、表单/编辑器、reference投影、save chain、权限逻辑及DTO/API保持原样；模式切换不重挂填写器。修改限前端组件、同功能既有测试、两份既有CR-009记录及独立实现截图，无后端/迁移/生产操作。
- 最终定向测试：8文件182 passed（SelfSummaryTask 67、Review 59、TemplateRenderer 29、SplitWorkspace 6、Header 4、ModeSwitch 4、mode偏好10、任务路由3）；命令：`npm --prefix hr-portal/frontend test -- src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/components/performance/PerformanceSplitWorkspace.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceSelfSummaryHeader.spec.ts src/components/performance/PerformanceWriteModeSwitch.spec.ts src/composables/usePerformanceWriteMode.spec.ts src/router/performanceTaskRoutes.spec.ts --silent`。
- `npm --prefix hr-portal/frontend run build`通过，只有既有VueUse PURE annotation提示。
- 浏览器：真实Vue + API拦截fixture，两个正式任务路由×单/双屏×短/长/未提交/未启动/逾期/过滤空/无参考=28组，通过同宽、外边界和滚动终点断言；另有两路由×窄屏短/长=4组、两路由×单/双屏只读=4组、切模式/resize/分隔Home-End保留编辑器DOM与答案/请求数=1组，共37组。1280×900双屏右白卡与footer横坐标761..1268、共同底边888；左参考底边888（含长参考滚到底）；单屏短白卡136..888，footer837..900，画布在其后延伸而滚动尾部保证末项可达。pageerror=0；28组基础验收写请求0；DOM保存场景仅有主动输入触发的1次fixture自动保存，布局切换无新增请求。
- 独立截图均为本地夹具、非目标生产截图：`CR-009-T03-implemented-aligned-dual-empty.png`、`CR-009-T03-implemented-aligned-dual-scroll-end.png`、`CR-009-T03-implemented-aligned-full.png`、`CR-009-T03-implemented-aligned-narrow.png`；位于ui-blueprints目录。
- 未完成范围：真实业务数据库、真实业务API保存及生产验收；本轮未提交、推送或部署。

## CR-009-T03 单屏页签/白卡同宽修复（2026-11-01）

- 已复现：常规滚动条浏览器1280px单屏，旧页签x12..1268/1256px，而内容白卡x12..1258/1246px，差值为内容独占的10px滚动条。前轮无头覆盖式滚动条截图不能排除此差异。
- 用户确认：以页签外框左右边界为视觉标准，页签与内容共享宽度计算；不硬补内容10px，也不单独把页签缩窄。REA本轮场景 `ev_520a1e6dbb97335a3d75ceedaa1a3c69cb3e4ec3354f22ccd7df4c80b8e14128`（仅声明模式切换成功）；同CDP目标只读几何核对，页签和内容外层白卡均x12..1268，共同滚动祖先占8px、内部右侧4px留白；内部正文额外padding不等于白卡边框。
- 实现：`PerformanceSplitWorkspace.vue` 将单屏页签移入当前内容同一滚动层，sticky top0并保留12px上下间距；页签slot根部margin归零而不是穿透改全局tabs；单屏使用8px滚动条、stable gutter与左12px/右4px，窄屏左16px/右8px，扣除共同8px滚动条后保持两边外留白一致。ResizeObserver同时测量页签高度，白卡min-height扣除本次真实页签高度，footer预留仍按footer实测值，长内容/窄屏提示不挤压短卡。双屏隐藏同一个页签DOM，不切换或重挂Renderer/编辑器。
- 单测：新增共同滚动祖先、页签高度72→94、模式切换隐藏/显示和input同实例覆盖。最终命令：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceSplitWorkspace.spec.ts src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/router/performanceTaskRoutes.spec.ts src/components/performance/PerformanceWriteModeSwitch.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts --silent`，6文件173 passed（含前轮未提交长提示测试）。
- 浏览器使用有头Chromium的非覆盖式滚动条：两任务路由×1280/390px×短/长/长提示=12组，均检查当前及参考白卡与tabs同宽、滚动后吸顶位置不变、最后字段不被footer遮挡、无水平溢出。桌面恢复x12..1268/1256px，窄屏x16..374/358px；长提示仍在框内。另4组验证短/长双屏底边及同宽、Home/End、窄屏回退与恢复/单屏切换不重建编辑器或增加请求，以及两路由只读无footer仍同宽。pageerror=0、写请求0。
- `npm --prefix hr-portal/frontend run build`通过（vue-tsc+Vite），只有既有VueUse PURE annotation提示；`git diff --check`通过。
- 实现截图：`ui-blueprints/CR-009-T03-implemented-single-shared-width.png`、`ui-blueprints/CR-009-T03-implemented-single-shared-width-narrow.png`，已读取，均为真实本地Vue路由+API fixture，非生产证据。
- 边界：仅改双屏工作区组件、其既有测试及本记录/蓝图说明；不改模板答案/投影/权限、API、数据库或生产。本轮无提交/推送/部署；前轮富文本长提示修改继续保留。
