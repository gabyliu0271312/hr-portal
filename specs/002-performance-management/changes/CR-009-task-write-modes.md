# CR-009 填写任务双屏/全屏模式

- 状态：主体已提交推送；本轮白色画布高度回归修复已完成本地验收，尚未提交/部署。
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
