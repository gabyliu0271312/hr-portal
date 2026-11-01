# CR-011 原子任务

## CR-011-T01 已完成评估抽屉与飞书交互对齐

- 状态：代码、定向测试、构建和脱敏本地视觉验收完成；生产及真实业务 API 验收未执行
- 前置：无。参考 REA Evidence：页面/侧栏 `ev_d4e5063d…`、DOM 与 React 组件 `ev_62cbd340…`、已完成内容 `ev_743eb247…`。
- 代码交付物：`PerformanceDrawerShell.vue`、`PerformanceReviewEvaluationDrawer.vue`、`PerformanceReviewPersonHeader.vue`、`Review.vue` 及对应测试。
- 非交付物：模板 DTO/数据库、权限规则、周期/项目快照、后端 API、360/校准列表和生产。
- UI：在 `ui-interaction.md` §1 与 Spec 012 N000 原则下保持既有信息架构；修正抽屉宽度、手柄、遮罩、头部/页签、内容层级、链接状态和窄视口。独立验收截图：`specs/002-performance-management/ui-blueprints/CR-011-T01-implemented-evaluation-drawer.png`、`specs/002-performance-management/ui-blueprints/CR-011-T01-implemented-evaluation-drawer-mobile.png`。
- 测试：Drawer shell 组件；抽屉详情组件；Review 页面；Vue TS 类型检查和 Vite build；尝试本地浏览器。
- Given/When/Then：Given 用户获准查看一个已完成评价，When 在成员列表打开行，Then 右侧非遮罩抽屉显示受后端授权的任务/人员和只读模板答案；When 拖动左缘，Then 热区/最小宽度/视口边界/重新打开缓存正确；When 复制地址后新开或重载页面，Then 同任务详情可恢复；When 关闭，Then 回到原节点列表且清除抽屉 URL 状态；When 任务不获准，Then API 错误态不泄漏答案。
- 实际验收：`npm --prefix hr-portal/frontend test -- --run src/components/performance/PerformanceDrawerShell.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceReviewPersonHeader.spec.ts src/views/performance/Review.spec.ts` → **71 passed**；`npm --prefix hr-portal/frontend run build` → **vue-tsc + Vite 通过**。
- 脱敏本地 Vite + Chrome + 受控 API 夹具：打开真实成员行，默认宽 1000、mask=false；距边缘 +15px 悬停颜色品牌蓝；拖动宽至 1100，刷新恢复宽度和 `drawer_tab`；390px 窄屏抽屉宽 390px，`document.documentElement.scrollWidth=390`；关闭清除抽屉 URL 参数；pageerror 0。截图：上述桌面与移动截图。
- 未执行/未声称：真实登录态、真实本地后端 API/数据库任务授权和快照数据、生产/部署；UI 夹具不构成后端权限/数据验收。
- 完成证据完整度：组件、页面、构建和截图验收已完成；生产与真实 API 验收超出本任务及本地环境，因此保留不执行状态。

## CR-011-T02 采集实现方式一致性补齐

- [x] 状态：前端采集实现一致性补齐与本地验收完成；下列真实后端/生产/翻译未知项不计为完成。
- 前置：CR-011-T01 本地展示基线；用户本轮明确要求采用采集实现方式。
- 必读：CR-011 spec 二次明确节、ui-interaction、Spec 002/012 UI 门禁、REA 保留脚本证据。
- 允许修改：PerformanceDrawerShell.vue/.spec.ts、PerformanceReviewEvaluationDrawer.vue/.spec.ts、Review.vue/.spec.ts、composables/usePerformanceDrawerResize.ts；上述 CR-011 文档及独立 `CR-011-T02-*` 截图。
- 契约：仅前端；模板任务 DTO/API/项目快照/权限/事务保持不变；rootReviewId 仅是本地获授权任务 ID 的 URL 表达。
- 交付：鼠标文档级拖动+50ms节流、初始宽度与缓存分离、Lockr命名空间/语言分栏、300ms缩窗防抖、200/300ms退出进入、无ESC关闭、rootReviewId/activeTab同步。
- 非目标：飞书未知服务端实现或翻译服务、后端重构、迁移、生产、commit、push；其他未提交改动保护。
- UI：既有信息架构的小范围交互修正，不新增独立蓝图；`ui-interaction.md` §4 作为确认行为，按 Spec 012 N000/N11 自检。
- Given/When/Then：打开已完成任务→初始/缓存宽度正确；鼠标移入热区后拖动→body坐标公式和50ms更新正确；拖动结束/关闭/卸载→清理监听/计时器；缩窗→300ms后适配；按ESC→保持详情；关闭按钮→200ms后销毁；刷新分享→同任务和节点引用页签。
- 验收：对应组件/页面单测、Vue类型检查+Vite构建、本地真实浏览器与脱敏API夹具；权限拒绝/异步竞态回归保留。独立截图 `ui-blueprints/CR-011-T02-implemented-exact-drawer.png`。
- 停止与回退：停止本地开发服务；仅移除本任务未提交增量，不整体回滚工作区/已部署版本。真实后端和生产未运行即明确未验收。

### CR-011-T02 当前验收结果

- 最终定向回归：`npm --prefix hr-portal/frontend test -- --run src/components/performance/PerformanceDrawerShell.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceReviewPersonHeader.spec.ts src/views/performance/Review.spec.ts` → **73 tests passed**。
- 共享回归：抽屉、详情、人员头部、项目流程/分布/对比/指标抽屉、校准条件、模板渲染、评估页 → **134 tests passed**。
- 构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc + Vite passed**。
- 浏览器（Vite + Chrome，受控 API）：默认宽1000、mask false；document mousedown/mousemove/mouseup拖动1100；写入 `{data:{"resizable-drawer-perf-drawer":{"zh-CN":1100,"en-US":1000}}}`；节点 activeTab=summary刷新恢复；ESC不关闭；390px视口 document 宽390；关闭后约200ms销毁；pageerror=0。截图：`ui-blueprints/CR-011-T02-implemented-exact-drawer.png`、`ui-blueprints/CR-011-T02-implemented-exact-drawer-mobile.png`。
- 未运行：后端/真实数据库/生产验收、飞书真实翻译后端；不得将本地夹具浏览器结果描述为授权或生产数据验收。

## CR-011-T03 人员头部空间与关闭按钮对齐

- [x] 状态：本轮头部差异已修复，组件回归、类型检查/构建及本地PC/窄抽屉/手机浏览器验收完成。
- 来源：同一飞书1000px抽屉实测，信息容器可用宽884px；工具栏仅在姓名首行；关闭按钮24×24、top=16；复制按钮26px高、top=16；复制后竖线两侧16px边距。
- 允许修改：PerformanceReviewPersonHeader.vue/.spec.ts、PerformanceDrawerShell.vue/.spec.ts 和本CR-011文档、独立CR-011-T03截图。保留其他富文本/模板未提交变动。
- 契约：仅既有Header DOM/CSS；person/profile_fields来源、权限裁剪、翻译/复制/关闭事件不变；无API、数据库、权限和生产操作。
- UI：姓名＋工具栏放在信息区首行，基本信息次行用满头像右侧空间；单字段不作flex缩小，超出按整行末尾省略；关闭按钮顶齐、16px图标/24px点击区；分隔线只在复制与关闭之间。390px不产生页面横向溢出，窄屏允许工具栏自然换行。
- Given/When/Then：完整资料/长字段/空权限字段→同一有序资料行；1000/720px抽屉→资料行不受工具栏列挤压，字段自然宽；复制按钮和关闭top相等；竖线在复制右侧、关闭左侧；翻译/复制/关闭事件保留；普通配置抽屉不受evaluation样式影响。
- 验收：相关组件/Review测试、构建、真实Vite＋Chrome受控API夹具测量和独立截图CR-011-T03-implemented-header-pc.png、CR-011-T03-implemented-header-narrow.png、CR-011-T03-implemented-header-mobile.png。真实业务库/生产不作为本轮已验收。

### CR-011-T03 验收证据

- 定向测试：`npm --prefix hr-portal/frontend test -- --run src/components/performance/PerformanceReviewPersonHeader.spec.ts src/components/performance/PerformanceDrawerShell.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/Review.spec.ts` → **76 passed**。
- 扩展回归：头部/公共抽屉/详情、项目流程/分布/对比/指标抽屉、校准条件、模板渲染、Review，共10文件 → **142 passed**；已有表格测试存在未注册loading指令警告，不影响通过。
- 构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc + Vite通过**；首次发现新增测试使用get().exists()类型错误，已改find().exists()后通过。
- 真Vue页面＋Chrome＋脱敏受控API：1000px抽屉profile宽884px（修前635px），720px抽屉profile宽604px（修前355px）；J3自然宽约12.55px，各字段display:inline不同比缩；复制top16px与关闭top16px，关闭24×24；竖线height约14.4px、左右16px边距，位于复制之后；390px页面scrollWidth390px；关闭仍能退出、pageerror0。
- 视觉截图已读取检查：`CR-011-T03-implemented-header-pc.png`、`CR-011-T03-implemented-header-narrow.png`、`CR-011-T03-implemented-header-mobile.png`。
- 不适用/未运行：无数据库/API/迁移变更，未重测真实业务库授权；未部署、commit、push；其他富文本和模板未提交改动未修改/撤销。
