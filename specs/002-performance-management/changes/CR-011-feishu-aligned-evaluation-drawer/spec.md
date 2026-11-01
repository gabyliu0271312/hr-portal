# CR-011 已完成评估详情抽屉对齐飞书

- 状态：CR-011-T01、CR-011-T02 本地实施与验收完成；真实后端和生产验收未执行
- 范围：既有绩效评估页中的已完成上级/他人评估只读抽屉；不新增页面或流程。
- 权威来源：用户于 2026-11-01 明确要求将已采集的飞书“上级评估—成员列表—已完成详情侧栏”整体对齐；参考同日 REA 页面、DOM、样式和导出脚本观察。

## 目标与非目标

- 将抽屉左缘拖动手柄、透明命中热区、拖动宽度/缓存、无遮罩行为、人员头部/页签/只读内容留白和深链接复开行为对齐已观察到的飞书页面。
- 继续复用 `PerformanceDrawerShell`、`PerformanceReviewEvaluationDrawer`、`PerformanceReviewPersonHeader`、`PerformanceLineTabs`、`PerformanceTemplateRenderer` 和已有模板任务详情 API。
- 保留本地按项目启动快照取模板、按任务和项目授权返回答案、按配置裁剪参考页签的既有业务/权限逻辑；不复制飞书 React 运行时或调用飞书 API。
- 不改模板结构、周期快照、人员可见字段、提交规则、校准/沟通业务规则、数据库/API 契约，不操作生产。
- 目标 URL 可通过当前页面查询参数分享并重开指定已完成任务；服务端现有任务详情授权仍是数据访问边界。

## 已确认视觉/交互基线

- REA 目标页面 CSS 视口 1280×673、已完成抽屉起始宽 1000px、最小 720px；宽度最大值为视口宽减 148px。窄视口允许缩至视口可用宽度，不产生页面级横向溢出。
- 左缘可见分隔线 1px；透明命中区域约 41px；居中 20×20 三点 SVG；默认灰色、悬停/拖动品牌蓝。
- 详情抽屉没有背景遮罩；保留评估成员页可见。ESC 关闭和焦点可访问性沿用本地应用约定。
- 宽度使用独立 localStorage 偏好键保存；Storage 禁用/抛错不得阻断渲染。
- 人员头部后紧接横向环节页签；仅渲染本地模板参考配置/API 返回的页签及其只读 schema/answers，不补造未经授权的内容。

## 影响边界

- UI：绩效评估列表与已完成评估抽屉；保持当前路由和信息架构。
- API/权限/数据/迁移：无；唯一详情仍经 `GET /performance/tasks/{task_id}/template-task` 并由后端做可信身份、处理人、员工和项目校验。
- 兼容性：未携带抽屉查询参数的既有 URL 仍打开原列表；未能解析/无权限的分享任务由现有接口错误态处理。

## 验收

- 定向 Vue 单测覆盖 mask/非 mask、宽度边界/持久化、拖动事件清理、ESC、深链接打开/关闭/复制、模板只读内容及原参考页签。
- `npm --prefix hr-portal/frontend test -- --run src/components/performance/PerformanceDrawerShell.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/Review.spec.ts`
- `npm --prefix hr-portal/frontend run build`
- 尝试本地真实浏览器验证并产出本任务独立截图；如登录/API/浏览器环境阻塞，明确记录，不冒称已完成真实视觉验收。

## 2026-11-01 二次明确：采用已观察到的实现方式（CR-011-T02）

用户明确要求不再保留上一轮自行选择的前端实现差异。本节替代上文的 Pointer Events、独立缓存、ESC 关闭约定：

- 基础 width=720、initialWidth=1000、minWidth=720、oppositeLimitDistance=148，缓存标识 perf-drawer。
- 缓存遵循导出脚本：localStorage 名称 `RESIZABLE-DRAWER-LOCKR-NS`，包装 `{data:{'resizable-drawer-perf-drawer':{'zh-CN':width,'en-US':width}}}`；按语言独立保存，不覆盖命名空间下其他抽屉记录。
- mousedown 在手柄上启动，document mousemove/mouseup，50ms leading/trailing throttle；拖动宽度基于 body 右边界与 clientX，而非初始鼠标偏移。
- resize 300ms debounce；遵循采集的缩窗比例约束；小于最小宽度的移动视口仍受 CSS max-width 限制，不出现横向溢出。
- 评估详情 keyboard=false，不通过 ESC 关闭；无 focus lock 和自动焦点跳转；仍可用关闭按钮与已存在键盘可访问手柄。
- 右侧进入/退出分别 300/200ms、cubic-bezier(.34,.69,.1,1)；关闭清理后销毁。
- URL 参数使用 rootReviewId 和 activeTab；本地 rootReviewId 映射获授权任务ID，activeTab 为当前/引用节点ID，不新建假根记录或改后端接口。
- REA 来源仍为 `ev_62cbd340b193e0c637123e1de642524bb4a5246972c5e843ddcf88855a8e57ea` 导出脚本 `vendor.a0853913.js`、`2611.ab8f8daa.chunk.js`、`5851.356bf9d6.chunk.js`；未观察到的飞书服务端/翻译实现保持未解，不伪造。


## 2026-11-01 CR-011-T04 白卡与分隔线

短内容白卡通过抽屉局部纵向flex链填满剩余高度，长内容自然增长并由外层内容区滚动；页签48px和白卡12px/20px内边距采用实测值。基本信息分隔线由共享PerformanceProfileSeparator统一，在详情与填写头部复用；采用采集到的border-left、12px高度、2px/8px间距与text-bottom基线。交互及证据见同目录任务卡T04；后端授权、模板和快照语义不变。
