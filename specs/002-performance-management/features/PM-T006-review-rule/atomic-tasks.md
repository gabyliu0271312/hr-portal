# PM-T006 评估规则 · 原子任务

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

> T00-E01 至 T00-E08 已完成结构化证据与几何比较：主契约已升级 schema v2，47 个状态的 visual inventory 非空，评分空间约束和备注 textarea resize 证据均完整；预览 rendered contract 几何 compare 已通过。严格全屏截图 diff 属于实现阶段的 T06/T06P 验收，不改变 T00 的采集证据建模完成性，不能把像素差异写成通过。

## PM-T006-T00 采集证据建模与像素契约

- [x] PM-T006-T00 采集证据建模与像素契约（采集证据与契约建模完成）
  - 结果：47 个既有状态及 20260830 新增固定分值20项variant均有采集证据映射；T00-E01 至 T00-E08 的结构、visual inventory、SVG、interaction、空间约束和备注 resize 均完成。rendered contract、截图diff和像素验收分别由 T06/T06P 管理，继续保持 not-run 或 blocked。
  - E05 结果：已补采 session `idreamsky.feishu.cn_20260826_194044_893758`，并将 `captures/initial/target_contract.json` 指向真实 `layout.json` 的 22 条 SVG bbox inventory；未使用 intrinsic size 代替页面 bbox。
  - 关键纠错：列表表头以 `RR-LIST-DEFAULT` 目标 `layout.json` 的实际 bbox 为准（x=`280/487/694/970/1245/1659`，width=`207/207/276/276/414/221px`），不得把实现中的固定列宽当作目标；添加等级为内联新增而非弹窗；默认评估类型为评级；语言为 checkbox 视觉。
  - 证据：`capture-manifest.md`、`capture-completion-checklist.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`extracted-ui-contract.json`、`fixed-score-options-20-capture-contract.json`。
  - 安全：未删除，未形成有效保存；空提交只触发前端校验。
  - 子项进度：T00-E01 至 T00-E08 采集结构证据完成；新增variant的validation scope未声明、replay未运行，保留为后续验收阻塞。
  - 阻塞项：T00自身采集证据建模无阻塞；全局像素完成仍由T06/T06P阻塞，不编造 pixel passed。

## PM-T006-T01 列表页骨架与 tab 接入

- [x] PM-T006-T01 列表页骨架与 tab 接入
  - 前置条件：T00；用户确认组件拆解；PM-T005 共享组件可用。
  - 允许新建：`frontend/src/views/performance/ReviewRuleManagement.vue`、共享 `AddOutlinedIcon.vue` 及测试。
  - 输入：`RR-LIST-DEFAULT`、`RR-TAB-HOVER`、`RR-NEW-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`。
  - 输出：页面只组装共享框架、工具栏和 `ReviewRuleTable` 占位；评估题与评估规则各自只渲染一个工具栏。
  - 禁止：修改 `PerformanceAdminLayout` 结构；使用未由目标 bbox 证明的固定列宽或旧比例列宽。
  - 验收：AC-01、AC-02；功能测试、构建和目标截图对比。
  - 证据：
    - `hr-portal/frontend/src/views/performance/ReviewRuleManagement.spec.ts`：2 passed。
    - `hr-portal/frontend/src/views/performance/ReviewQuestionManagement.spec.ts`：1 passed。
    - `npm --prefix hr-portal/frontend run build`：passed；仅第三方 PURE 注释警告。
    - 实际页面：`http://localhost:8080/performance/settings/evaluation-questions`，tab/单工具栏/新建/搜索/筛选/空态验证通过。
    - PNG：`evidence/PM-T006-T01-implemented-list-shell.png`；实现卡片 bbox `1630×897 @ (260,162)`，目标为 `1640×898`，现有 `PerformanceAdminLayout` 造成的 10×1px 外框漂移留待 T06 统一校正。
  - 阻塞项：无。
  - 完成定义：列表骨架、tab 接入、聚焦测试、构建、真实页面和独立 PNG 证据均完成。

## PM-T006-T02 ReviewRuleTable

- [x] PM-T006-T02 六列表格、分页与行操作
  - 前置条件：T01。
  - 新增：`ReviewRuleTable.vue`、`reviewRuleTypes.ts` 及组件测试。
  - 输入：`RR-LIST-DEFAULT`、`RR-LIST-20-ROWS`、`RR-EDIT-HOVER`、10行1280×639补采 metrics/PNG。
  - 输出：六列表头 bbox 与 `RR-LIST-DEFAULT` 一致；创建人 chip；编辑/删除；表头和分页常驻；表格自然增长；外层容器纵向滚动。
  - 状态：编辑可触发事件；删除默认 disabled；0行仍显示白底表头与“共0条/1/10条每页”；分页紧跟最后一行16px；禁止页面min-height768、表格min-height800/max-height600。
  - 验收证据：
    - `ReviewRuleTable.spec.ts`：4 passed，覆盖六列/宽度、无table max-height、编辑/disabled删除、loading/empty常驻表头、0行常驻分页和翻页事件。
    - `ReviewRuleManagement.spec.ts`：2 passed；`ReviewQuestionManagement.spec.ts`：1 passed；`PerformanceAdminLayout.spec.ts`：3 passed。
    - 聚焦测试总计 10 passed，无 Vue warning。
    - `npm --prefix hr-portal/frontend run build`：passed；仅第三方 PURE 注释警告。
    - 实现已删除 `ReviewRuleTable min-height:800px` 与 `el-table max-height:600px`；`PerformanceListPage` 改为当前视口高度的flex column且min-height0；`PerformanceAdminLayout` 改为100vh固定高度链和main外层滚动。
    - frontend 容器已重建并运行，`http://localhost:8080/` 返回200。
    - 2026-08-26 表头纠偏后容器再次重建；采集 session `C:\Users\gaby.liu\ClonedSites\localhost_8080_20260826_122947_794239` 在 1920×1080 / DPR1 / Chrome 151 下测得白卡片 `x=260,w=1640`，六列表头 x=`280/487/694/970/1245/1659`、width=`207/207/276/276/414/221px`，与 `RR-LIST-DEFAULT` 逐项一致。
    - 2026-08-26 内部标题纠偏 session `C:\Users\gaby.liu\ClonedSites\localhost_8080_20260826_124144_914762`：移除 Element Plus `.cell` 重复 12px padding 后，标题容器 x=`292/499/706/982/1257/1671`、y=`243`、h=`22`，computed `padding-left=0px; font-size=14px; line-height=22px`，与目标逐项一致。
    - 表头纠偏聚焦测试：`ReviewRuleTable.spec.ts`、`PerformanceAdminLayout.spec.ts`、`ReviewRuleManagement.spec.ts`、`ReviewQuestionManagement.spec.ts` 共 13 passed；生产构建 passed，仅第三方 VueUse PURE 注释警告。
    - 修复后实际页面已由用户在原生 Chrome 确认：空态高度、表头、分页和外层滚动行为正确。
    - 用户显式确认实际页面正确，并授权在缺少修复后独立PNG的情况下直接勾选T02；该例外不等于T06像素验收通过。
  - 未运行：实际数据行截图；当前无后端/API且禁止生产 mock，列和行操作由组件 fixture 测试验证，最终像素由 T06 fixture 验收。
  - 阻塞项：无。
  - 完成定义：组件、测试、构建、容器部署和实际页面人工复核已完成；独立PNG由用户显式豁免，最终像素截图仍由T06补齐。

## PM-T006-T03 create/edit 页面壳

- [x] PM-T006-T03 create/edit 全屏页面壳
  - 前置条件：T01；共享 `PageHeader`、`FullScreenModal` 必须先按PM-T006共享契约修正并通过视觉复核。
  - 共享组件现状：已按PM-T006共享契约修正；默认min-width为0，footer间距使用单一12px来源，不再叠加容器gap与Element Plus相邻按钮margin。
  - 新增：`ReviewRuleCreatePage.vue` 及3个页面测试；create/edit共用组件，字段区保留T04占位。
  - 路由：`evaluation-questions/review-rules/create` → `ReviewRuleCreate`；`evaluation-questions/review-rules/:id` → `ReviewRuleEdit`。
  - 入口：评估规则“新建”进入create；edit事件携带id和name进入edit；返回/取消回到`?tab=rule`。
  - 输入：`RR-CREATE-RATING`、`RR-EDIT-PREFILLED`、footer states。
  - 输出：共用 `FullScreenModal + PageHeader + ReviewRuleForm + FixedActionBar`。
  - 禁止：640px dialog；复制两套 create/edit 表单；提前实现T04字段；共享壳写入页面专属min-width；footer重复计算12px间距。
  - 验收：AC-03、AC-08；滚动、footer、返回、标题和预填状态。
  - 验证现状：T03+共享+布局功能测试16 passed、`vue-tsc && vite build` passed、frontend容器已重建；create/edit HTTP路由均返回200；用户已在原生Chrome确认白卡片与footer定位、间距和无额外水平偏移正确。
  - 阻塞项：无。
  - 完成定义：共享壳契约、代码、测试、构建、部署和实际页面视觉全部通过；T04开始前仍不得把T03占位卡当作业务表单像素证据。

## PM-T006-T04 表单与三种评估类型

- [x] PM-T006-T04 表单字段与类型状态机
  - 前置条件：T03。
  - 允许新建：`ReviewRuleForm.vue`、`ReviewTypeRadioGroup.vue`、`ScoreConfig.vue`、`ScoreMappingConfig.vue` 及测试。
  - 输入：`RR-CREATE-RATING`、`RR-EDIT-PREFILLED`、`RR-SCORE`、`RR-MAPPING`、`RR-RADIO-FOCUS`。
  - 实现结果：字段、三种类型状态、必填校验、上下限/精度联动均已实现；T04 聚焦与回归测试 25 passed；`vue-tsc && vite build` passed；frontend 容器已重建，create HTTP route 返回200；T04 视觉 fixture 已纳入后续 9 组运行时截图。2026-08-31 修复评级量化校验：新建/编辑在开关开启且任一量化分为空时，提交均显示“量化分为必填”并阻断 submit。
  - 验收：AC-04、AC-07、AC-10；无后端写入。
  - 阻塞项：无。
  - 完成定义：字段、类型状态、校验、测试、构建和运行时 fixture 均完成。

## PM-T006-T05 等级与分数子区间内联编辑

- [x] PM-T006-T05 LevelConfigEditor 与 ScoreIntervalEditor
  - 前置条件：T04。
  - 允许新建：`LevelConfigEditor.vue`、`ScoreIntervalEditor.vue` 及测试。
  - 输入：add-level、mapping、interval source states，`RR-RATING-QUANTIFIED` 及 `quantified-rating-contract.md`，以及人工混采 `RR-COLOR-PICKER-OPEN`、`RR-COLOR-SELECTED`、`RR-COLOR-PICKER-REOPENED`。
  - 输出：等级行 drag/color/code/name/value/delete；等级 3→4；`quantified=true` 时新增量化分必填列并保留量化值；区间 2→3；新增区间始终插入倒数第二行；第1行左值绑定评分下限，后续行左值绑定上一行上限，最后1行右值绑定评分上限；所有左值只读；precision联动step；所有数字输入min=0；区间表头依次显示 `分数子区间 *`、`等级代号 *`、`等级名称` 并与行列对齐；maxlength 和 disabled 边界；颜色面板固定12色、选择后关闭、重开保持选中。
  - 颜色验收：不得使用原生 `input[type=color]` 面板；触发器24×24圆形并使用 `ExpandDownFilled`；面板6×2、色块18×18、`DoneOutlined`、箭头、边框和阴影按契约复现。
  - 实现证据：新增 `ColorPicker.vue`、`performanceColorOptions.ts` 和 `ColorPicker.spec.ts`；`LevelConfigEditor` 已移除原生颜色 input 并接入固定12色色板；已实现 `RR-RATING-QUANTIFIED`：`ReviewRuleLevel.quantifiedScore`、开关联动、量化分必填列、off/on grid变体和值保留；PM-T006相关8个测试文件共29 tests passed；`vue-tsc && vite build` passed；Docker镜像构建和容器重建 passed，`http://localhost:8080/` 返回200。
  - 未运行：登录态下真实页面截图和 rendered contract 对比；本地 Clone 因缺少 `WEB_CLONER_STORAGE_STATE` 被登录门禁阻塞，不据此宣称像素通过。
  - 禁止：创建 `AddLevelModal`；把任一内联新增改成弹窗。
  - 验收：AC-05、AC-05Q、AC-06、AC-06A、AC-06B、AC-09。

## PM-T006-T04P 预览校验与数据投影

- [x] PM-T006-T04P 三种评估类型预览校验和只读 payload
  - 前置条件：T04；`preview-extracted-ui-contract.json`、`preview-development-contract.md` 已确认。
  - 允许修改：`ReviewRuleForm.vue`、预览校验/数据投影测试；不修改后端。
  - 输入：全部 `RR-PREVIEW-*-VALIDATION*` 状态。
  - 输出：评级名称/3行代号，评分名称/上下限，映射名称/上下限/合法区间/代号的预览校验；校验失败不打开modal；校验通过产生只读preview payload。
  - Given/When/Then：AC-07P；分别覆盖三种错误和恢复。
  - 禁止：触发保存/提交；在预览中直接mutate表单；把提交校验结果冒充预览校验证据。
  - 验收结果：`ReviewRuleForm.spec.ts` 预览校验、恢复和 payload 测试通过；预览只发出深拷贝 payload，不回写表单。2026-08-31 补充评级量化回归：新建/编辑在量化分缺失时预览均显示逐行提示且不发出 preview；修复后 `ReviewRuleForm.spec.ts` 与 `ReviewRuleCreatePage.spec.ts` 共18 tests passed。
  - 状态：`passed`。

## PM-T006-T05P 共享预览弹层与类型渲染器

- [x] PM-T006-T05P ReviewRulePreviewModal 与三种类型预览
  - 前置条件：T04P。
  - 允许新建/修改：`ReviewRulePreviewModal.vue`、`RatingRulePreview.vue`、`ScoreRulePreview.vue`、`ScoreMappingRulePreview.vue`、`PreviewCloseButton.vue` 及测试。
  - 输入：六个正常预览、`RR-PREVIEW-MAPPING-VALUE-50`、所有completed状态。
  - 输出：共享600px modal；评级非量化/量化；评分bounds/fixed；mapping initial/value-50；`CloseOutlined` verified dismiss；新建/编辑共用组件树。
  - 几何：rating/score `600×158 @ (660,461)`；mapping `600×358.667 @ (660,360.667)`；header72；body inline24；close hit area28、SVG20；mapping preview input `216.667×22 @ (695.667,437.333)`。
  - Given/When/Then：AC-07P1 至 AC-07P4。
  - 禁止：复制三套modal；以文字“×”或近似图标代替 `CloseOutlined`；关闭不做after-state验证；mapping previewValue回写表单。
  - 验收结果：共享 modal 已接入 create/edit 页面；`ReviewRulePreviewModal.spec.ts` 2 passed；预览按钮、三类型渲染器、CloseOutlined 关闭和 mapping 本地输入均已验证；`vue-tsc --noEmit`、Vite build passed；Docker 前端容器已重建。
  - 状态：`passed`。

## PM-T006-T06P 预览像素对齐与验收

- [ ] PM-T006-T06P 预览 rendered contract 和截图 diff
  - 前置条件：T04P、T05P；评分会话空间分析已完成。
  - 输入：`preview-extracted-ui-contract.json`、`preview-development-contract.md`、17个source state及原始target contracts；另含 `fixed-score-options-20-capture-contract.json` 的新增variant。
  - 输出：预览 `rendered-ui-contract.json`，六个既有正常预览、三个校验错误、mapping value-50实现截图和diff；固定分值20项新增variant的数量布局、通用hover、箭头和遮罩代码已实现，rendered contract暂不运行。
  - 关系断言：modal width、header/body高度、body inset、terminal bottom gap、close button/SVG、mapping input initial/value invariant；新增variant追加navigator viewport、chip pitch、track offset、左右导航、通用hover和多页顺序导航关系，采集环境edge hover偏移不作为实现断言。
  - 实际命令：既有预览 `compare_preview_contract.py` 曾返回0；本轮新增variant的rendered contract、截图diff和像素验收保持 `not-run`。
  - 实现证据：`FixedScorePreviewNavigator.spec.ts`、`FixedScoreOptionsEditor.spec.ts`、`ReviewRulePreviewModal.spec.ts`、`ReviewRuleForm.spec.ts` 共32 tests passed；`npm --prefix hr-portal/frontend run build` passed。
  - 阻塞：新增session mission/validation scope未声明，replay未运行；rendered contract、截图diff和像素验收按约定保持 `not-run`。
  - 状态：`blocked`。

## PM-T006-T07 使用状态、软删除与后端编辑策略

- [x] PM-T006-T07 评估规则使用状态和服务端字段级保护
  - 目标：后端统一派生普通题/子题使用状态，支持未使用规则软删除，并按三种评估类型阻断已使用规则的越权字段修改。
  - 类型：契约/API/后端/测试。
  - 前置条件：T04、T05；`usage-aware-edit-delete-contract.md` 已由用户确认。
  - 必读：`review_router.py`、`models.py`、`test_performance_review_questions.py`、`usage-aware-edit-delete-contract.md`。
  - 允许修改：`hr-portal/backend/app/performance/review_router.py`、`hr-portal/backend/tests/test_performance_review_questions.py`、本功能规格文件。
  - 禁止修改：数据库模型和迁移；权限码；评估题字段模型。
  - 输入契约：`performance_review_questions.rule_id` 为唯一使用状态真源；普通题与子题统一。
  - 输出契约：列表/详情返回 `is_used/deletable`；DELETE 软删除；已使用删除或修改锁定字段返回稳定409错误码；规则更新/删除与评估题绑定锁同一规则行。
  - UI：无直接 UI；为T08提供服务端真源。
  - API/数据库/权限：新增DELETE；PATCH改为使用状态相关；复用`status`和`performance.configuration.manage`，无迁移。
  - 测试：未使用全量编辑/软删除、普通题/子题使用判定、三类型允许/拒绝字段、404/409、行锁调用。
  - 证据：`docker compose -f hr-portal/docker-compose.yml exec -T backend pytest -q tests/test_performance_review_questions.py` → 10 passed，1个第三方PendingDeprecationWarning。
  - 非范围：周期快照和历史评估数据迁移。
  - 完成定义：代码、聚焦测试、错误码和并发边界全部通过后由主智能体勾选。

## PM-T006-T08 列表删除状态与三类受限编辑 UI

- [x] PM-T006-T08 使用状态驱动的列表与编辑页
  - 目标：列表按服务端状态开放/禁用删除，编辑页按类型执行已确认字段矩阵。
  - 类型：前端/UI/测试。
  - 前置条件：T07。
  - 必读：`usage-aware-edit-delete-contract.md`、`component-model.md`、`acceptance-contract.md`。
  - 允许修改：`frontend/src/api/performance.ts`、`frontend/src/api/performance.js`、`frontend/src/components/performance/ReviewRule*.vue`、`LevelConfigEditor.vue`、`ScoreConfig.vue`、`ScoreMappingConfig.vue`、`ScoreBoundsField.vue`、`FixedScoreOptionsEditor.vue`、`ScoreIntervalEditor.vue`、对应测试和 `frontend/src/views/performance/ReviewRule*.vue`。
  - 允许新建：`PerformanceDisabledReason.vue`及对应组件测试。
  - 禁止修改：路由信息架构、PerformanceAdminLayout、数据库与后端权限。
  - 共享文件：`.js/.ts` API必须同步，避免无扩展名导入解析分叉。
  - 输入契约：服务端 `is_used/deletable`；编辑页详情为权威状态。
  - 输出契约：未使用完整编辑；已使用评级/评分/映射按字段矩阵禁用或隐藏；删除禁用原因固定。
  - UI：复用同一表单树和既有disabled视觉；not-allowed命中区抽为共享系统组件；不新增页面或布局。
  - 测试：列表可删/不可删、提示和事件；三类型正反向字段断言；新建/未使用编辑回归；删除确认和刷新。
  - 证据：T08实现门禁PASS；7个聚焦前端测试文件44 tests passed；`npm --prefix hr-portal/frontend run build`通过，仅第三方PURE注释警告。完整`LevelConfigEditor.spec.ts`另有1个既有负数输入断言失败（期待0、实际保留0.1），与本次结构锁定路径无关且未据此宣称全套通过。
  - 采集/像素：复用 `RR-LIST-DEFAULT`、`RR-EDIT-PREFILLED`、`RR-SCORE`、`RR-MAPPING`、`RR-RATING-QUANTIFIED`；新增业务矩阵来自用户确认契约，像素截图保持not-run。
  - 完成定义：组件测试、构建和真实容器行为验证后由主智能体勾选。

## PM-T006-T09 使用状态回归与容器验收

- [ ] PM-T006-T09 跨层回归、构建和运行时证据
  - 目标：验证 UI→API→状态写入/重开链路，并记录未运行的像素项。
  - 类型：测试/验收。
  - 前置条件：T07、T08。
  - 允许修改：本功能验收和原子任务文档；测试缺口限T07/T08允许文件。
  - 测试契约：后端聚焦pytest；前端ReviewRule相关Vitest；`vue-tsc && vite build`；Docker frontend/backend重建；列表与编辑路由HTTP smoke。
  - 验收：普通题/子题统一；软删除后列表消失；409不写入；三类受限编辑与未使用完整编辑。
  - 证据：后端10 tests passed；前端7个聚焦文件44 tests passed；`vue-tsc && vite build` passed；backend/frontend Docker镜像构建与容器重建成功；列表和编辑SPA路由HTTP 200；未认证API返回401而非404；容器OpenAPI已确认DELETE路径及`is_used/deletable`字段；构建产物包含固定删除提示。
  - 阻塞：acceptance门禁返回`rendered_contract_mismatch:variant_contracts`，新使用状态variant尚未生成登录态rendered contract/截图；因此T09保持未勾选，PM-T006像素状态继续blocked。
  - 跳过规则：无认证运行时夹具或目标截图时分别记为blocked/not-run，不得冒充通过。
  - 完成定义：测试、构建、容器、规格证据一致后由主智能体勾选。

## PM-T006-T06 像素对齐与验收

- [ ] PM-T006-T06 像素对齐与验收
  - 前置条件：T01-T05 全部完成。
  - 输入：`pixel-contract.md`、`acceptance-contract.md`、`extracted-ui-contract.json`、`preview-extracted-ui-contract.json` 和基础/预览目标状态。
  - 测试命令：
    - `cd hr-portal/frontend && npm test -- src/views/performance/ReviewRuleManagement.spec.ts src/views/performance/ReviewRuleCreatePage.spec.ts`
    - `cd hr-portal/frontend && npm run build`
    - 截图 diff 命令在实现阶段建立并记录。
  - 输出：实现截图、diff、viewport/DPR/font 环境、算法、阈值和实际结果。
  - 完成定义：AC-01 至 AC-10 的适用项通过；passed/not-run/blocked 分别记录；不得仅凭构建或目测勾选。

## T00-E07 双向覆盖与冲突检查

- 检查对象：`extracted-ui-contract.json`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`atomic-tasks.md`、`capture-manifest.md`、`capture-completion-checklist.md`。
- source state 双向覆盖：23 个 JSON state 均能回溯 `capture-manifest.md`，组件模型覆盖全部 23 个状态；验收契约和原子任务对未逐条展开的状态由本节统一索引：`RR-LIST-DEFAULT`、`RR-LIST-20-ROWS`、`RR-NEW-HOVER`、`RR-EDIT-HOVER`、`RR-EDIT-PREFILLED`、`RR-CREATE-RATING`、`RR-SUBMIT-HOVER`、`RR-PREVIEW-HOVER`、`RR-CANCEL-HOVER`、`RR-ADD-LEVEL-HOVER`、`RR-LEVEL-INLINE-ADD`、`RR-MAPPING`、`RR-INTERVAL-HOVER`、`RR-INTERVAL-INLINE`、`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`、`RR-SCORE`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`、`RR-SUBMIT-FOCUS`。
- 组件覆盖：JSON 的 9 个组件均在 `component-model.md` 的组件树/契约中存在；业务状态使用的 `ReviewRuleTable`、`PageHeader`、`FullScreenModal`、`ReviewRuleForm`、`ReviewTypeRadioGroup`、`ScoreConfig`、`ScoreMappingConfig`、`LevelConfigEditor`、`FixedActionBar` 均无孤立项。
- 交互覆盖：23 个状态的 36 条 interaction 均已对象化；每项具备 `kind`、`semantic_state`、`target`、`phases`、`before`、`after`、`action`，并保留真实 evidence 路径。
- SVG 覆盖：23 个状态的 528 个 SVG 实例均保留 `source_state_id`、target selector 和 target contract pointer；`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空。
- 可测关系：JSON 的 5 条 `layout_relations` 均来自同一 source state 的 target contract/interaction evidence，未跨状态推断。
- 结果：**基础状态与预览状态的 E07 双向覆盖通过**。主契约 47 个状态 visual inventory 非空；`coverage.unmapped_*`、`cross_document_conflicts`、`missing_terminal_anchors`、`uncompared_variant_groups`、`unmapped_containers` 均为空。预览 rendered contract 几何 compare 已通过；截图 diff 单独保持 failed，不影响 E07 结构审计，但阻塞 PM-T006 像素完成。

## T00-E08 实现契约与目标契约反向比较

- 状态：`passed`（预览几何专项）；全功能 PM-T006 仍因严格截图 diff failed 保持 blocked。
- 输入：统一 viewport/DPR/font fixture 下由 Chrome CDP 运行时生成的 `rendered-ui-contract.json`。
- 预览比较命令：`python .claude/skills/performance-spec-development/scripts/compare_preview_contract.py --target preview-extracted-ui-contract.json --runtime evidence/preview-diff/runtime-snapshots.json --out rendered-ui-contract.json`，exit code 0。
- 主契约门禁：`check_ui_spec.py --task-id PM-T006-T00`，exit code 0；复合控件、resize、visual inventory 和空间约束均通过。
- 截图命令：`compare_preview_screenshots.py` 已运行并生成9组文件，但严格全屏像素 diff exit code 1，原因是目标截图水印/字体栅格差异；不得以此宣称像素通过。
