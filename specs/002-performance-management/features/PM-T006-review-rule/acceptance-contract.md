# PM-T006 像素验收契约

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

> T00 已完成目标证据；本文件定义后续 T01-T06 的实现验收。mock 数据内容、后端 API、权限和持久化不在范围。

## AC-00 证据门禁

Given 开始 PM-T006 UI 实现  
When 检查 capture manifest、completion checklist、component model 和 pixel contract  
Then 23 个命名状态及 10/20 行增长证据均可回溯到采集产物，且用户已确认组件拆解。

当前：T00-E01 至 T00-E08 的结构证据、备注 textarea resize 和评分空间约束均通过；主契约 47 个状态的 visual inventory 非空，`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空。T01、T03 已通过实际页面验证；预览 rendered contract 几何 compare 已通过，严格全屏截图 diff 仍因目标水印/字体栅格差异失败，因此 PM-T006 像素总体保持 blocked。

## AC-01 列表页

Given `RR-LIST-DEFAULT`  
When 渲染评估规则列表  
Then 页面标题为“评估题”，评估规则 tab 选中；工具栏、六列、行操作和分页匹配截图；六个表头必须匹配目标 `layout.json` 的 bbox：x=`280/487/694/970/1245/1659`，width=`207/207/276/276/414/221px`，不得以实现代码中的固定 120/120/120/160/240/128px 作为目标。

## AC-02 列表交互状态

Given 列表已加载  
When 触发新建、tab、筛选、搜索、编辑和 disabled 控件状态  
Then 分别匹配 `RR-NEW-HOVER`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`、`RR-EDIT-HOVER`；删除和单页分页保持真实 disabled。

## AC-02A 列表自然增长与滚动

Given 分别渲染 0、10、20 行规则  
When 检查白卡片、table-wrapper、分页和滚动容器  
Then 必须满足：

- 表头白底且始终存在；
- 分页在0行也显示“共0条 / 1 / 10条/页”，前后页 disabled；
- table wrapper 约按 `140 + N×49px` 自然增长；
- 列表页根容器 `min-height:0`，不得设置768px固定下限；10行测得768仅是内容结果；
- white card 使用 `flex:1 1 0%`，高度为 `max(真实剩余视口, tableWrapper+56px)`；
- 最后一行与分页间距16px，分页 `height:28px; margin:16px 0`；
- table/table-wrapper `max-height:none`，table content 无纵向内部滚动；
- 超高内容由外层 `.content.container-padding` 滚动；20行1920×1080时 scrollHeight/clientHeight 为1302/1024。

证据：10行用户补采 metrics/PNG、`RR-LIST-20-ROWS`。

## AC-03 create/edit 共用组件树

Given 分别打开新建和真实编辑状态  
When 对比 DOM/组件结构  
Then 二者使用同一 `ReviewRuleForm` 和同一 `PageHeader + FullScreenModal`；共享壳默认 `min-width:0`，不得继承模板页1200/1300px下限；create 标题“新建评估规则”，edit 标题为规则名称；edit 预填且评估类型不可切换。

证据：`RR-CREATE-RATING`、`RR-EDIT-PREFILLED`。

## AC-04 三种评估类型

Given 表单默认评级  
When 切换评级、评分、评分映射等级型  
Then 字段、选项、顺序、默认值、内容高度和滚动匹配 `RR-CREATE-RATING`、`RR-SCORE`、`RR-MAPPING`；评分和评分映射等级型切换小数位设置后，已输入的上下限及区间数字立即按 0/1/2 位小数格式化，手工输入完成并失焦后也按当前精度补齐或调整小数位；步进立即联动为 1/0.1/0.01，且所有数字值不得小于 0。

## AC-05 等级内联编辑

Given 评级配置已显示  
When 点击“添加等级”  
Then `LevelConfigEditor` 从 3 行变为 4 行，不出现 dialog；拖拽、颜色、code/name/value 和删除控件匹配证据。

证据：`RR-ADD-LEVEL-HOVER`、`RR-ADD-LEVEL-FOCUS`、`RR-LEVEL-INLINE-ADD`。

## AC-05Q 评级量化列

Given `RR-CREATE-RATING` 且“评级可参与计算”关闭  
When 开启该开关  
Then 进入 `RR-RATING-QUANTIFIED`：开关 `aria-checked=true`，新增“量化分 *”列和每行数字输入，原“量化值”列继续存在；默认3行时两类数字输入各3个，卡片保持800×417。完整数据、几何和恢复规则见 `quantified-rating-contract.md`。

## AC-05A 颜色选择器

Given `RR-COLOR-PICKER-OPEN`，评级等级第一行颜色控件处于默认色  
When 打开颜色选择器  
Then 触发器为24×24圆形并使用 `ExpandDownFilled`；portal浮层包含6列×2行共12个18×18px色块、8px间距、4px色块圆角、白底、灰边、8px面板圆角、目标阴影和箭头；第1色为active并显示12×12 `DoneOutlined`。

Given 颜色面板已展开  
When 选择第4个色块 `rgb(183,237,177)`  
Then 面板关闭，第一行颜色控件背景为 `rgb(217,245,214)`；重新打开时第4色保持active。证据：`RR-COLOR-SELECTED`、`RR-COLOR-PICKER-REOPENED`。

And 实现不得使用浏览器/操作系统原生 `input[type=color]` 面板，不得用 `DownOutlined` 替代 `ExpandDownFilled`。

## AC-06 分数子区间

Given 评分映射等级型已显示  
When 点击“添加分数子区间”  
Then 区间从 2 行变为 3 行，首尾 disabled 边界重算；字段宽度和页面 scroll height 匹配 pixel contract。

证据：`RR-MAPPING`、`RR-INTERVAL-HOVER`、`RR-INTERVAL-INLINE`。

## AC-06A 区间边界联动

Given 评分映射等级型已显示，评分下限/上限和区间列表可编辑
When 初始化区间、修改评分上下限、修改区间右侧边界或添加/删除区间
Then 必须满足：

- 第 1 行左侧值始终等于评分下限；
- 第 N 行左侧值始终等于第 N-1 行右侧值；
- 最后一行右侧值始终等于评分上限；
- 所有区间左侧输入框均为 readonly，不产生手动输入或步进更新；
- 最后一行右侧输入框按既有首尾边界规则 disabled；
- 添加区间始终在当前列表倒数第二行插入；
- 当前精度为 0/1/2 位时，右侧可编辑数字输入步进分别为 1/0.1/0.01；所有数字边界不得小于 0。

证据：`RR-MAPPING`、`RR-INTERVAL-INLINE`；运行时需补充评分上下限初始化、编辑和新增后的行为证据。

## AC-06B 区间表头

Given 评分映射等级型的分数子区间编辑器已显示
When 检查区间表头和下方区间行
Then 必须满足：

- 同一表头行依次显示 `分数子区间 *`、`等级代号 *`、`等级名称`；
- `分数子区间 *` 覆盖下限、运算符和上限三列；
- `等级代号 *` 与 code 输入列左边缘对齐；
- `等级名称` 与 name 输入列左边缘对齐；
- 删除操作列不显示表头；
- 新增区间后表头仍与对应 code/name 列对齐。

证据：`RR-MAPPING`、`RR-INTERVAL-INLINE`。

## AC-07 校验

Given 新建或编辑表单的评估类型为评级
And “评级可参与计算”已开启
And 任一等级的量化分为空
When 点击提交
Then 对应量化分显示“量化分为必填”，保持当前页面且不产生保存请求。

Given 新建表单名称和等级代号为空  
When 点击提交  
Then 显示“名称为必填”和每行“等级代号为必填”，保持当前页面且不产生有效保存。

证据：`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`。

### AC-07R 备注纵向resize

Given 备注textarea默认bbox为 `758.667×49.333`  
When 从原生右下角resize handle向下拖动约100px  
Then dragging和after-drag高度约149px  
And `after.height > default.height`  
And 宽度保持约758.667px  
And 不产生保存/提交请求。

证据：`RR-REMARK-RESIZE-DEFAULT`、`RR-REMARK-RESIZE-DRAGGING`、`RR-REMARK-RESIZE-AFTER`。

## AC-07P 预览校验与共享弹层

Given 任一评估类型存在未满足的预览必填项  
When 点击“预览”  
Then 显示当前类型的行内错误  
And 不创建预览 modal。

类型规则：

- 评级：名称和默认3行等级代号必填；“评级可参与计算”开启时，每行量化分同时必填；
- 评分：名称、评分上下限必填；
- 评分映射：名称、评分上下限、合法区间边界和每行等级代号必填。

Given 当前类型表单已通过预览校验  
When 点击“预览”  
Then 使用同一个 `ReviewRulePreviewModal` 组件树  
And modal宽600、header高72、body左右inset24、bottom inset24。

证据：全部 `RR-PREVIEW-*-VALIDATION*` 和正常预览状态；详细路径见 `preview-development-contract.md`。

## AC-07P1 评级预览

Given 名称和C/B/A等级代号已填且量化开关关闭  
When 点击预览  
Then modal为 `600×158 @ (660,461)`  
And 按配置顺序显示C/B/A。

Given 通过关联文案点击真实switch并验证 `aria-checked=false→true`  
And 量化分1/2/3已填  
When 点击预览  
Then 复用同一600×158外壳  
And 关闭后量化表单状态保持。

证据：`RR-PREVIEW-RATING-NON-QUANTIFIED`、`RR-PREVIEW-RATING-QUANTIFIED-FORM`、`RR-PREVIEW-RATING-QUANTIFIED`。

## AC-07P2 评分预览

Given 上下限方式为0～100  
When 点击预览  
Then modal为600×158  
And preview native input约 `216.667×22 @ (695.667,537.667)`。

Given 固定值方式选项为20/40  
When 点击预览  
Then body显示20和40  
And 不同时显示上下限输入。

证据：`RR-PREVIEW-SCORE-BOUNDS`、`RR-PREVIEW-SCORE-FIXED`。

## AC-07P3 评分映射预览

Given 全局范围0～100、中间边界60、代号C/A已配置  
When 点击预览  
Then modal为 `600×358.667 @ (660,360.667)`  
And preview native input为 `216.667×22 @ (695.667,437.333)`。

When 在预览输入合法分数50  
Then 映射结果在同一modal内更新  
And modal/header/body/input bbox保持不变  
And 不回写表单区间配置。

证据：`RR-PREVIEW-MAPPING-INITIAL`、`RR-PREVIEW-MAPPING-VALUE-50`。

## AC-07P4 关闭预览

Given 任一预览是当前活动顶层弹层  
When 点击“关闭预览”  
Then 解析到 `CloseOutlined` 所属28px按钮  
And target resolution为 `inferred_icon_semantics`  
And `dismiss_verification.status=verified`、`dismissed=true`  
And 返回预览前表单状态。

评分会话已在修复分析器后离线重建，`missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`；关系验收目标可进入实现比较。

## AC-07P5 固定分值20项预览新增variant

Given 普通评分选择“在固定分值选项内选择评分”且表单有固定值1～20
When 点击预览
Then 打开共享 `ReviewRulePreviewModal`
And 可视 modal root 为 `600×158px`
And navigator viewport 为 `552×38px`
And option chip 为 `42×32px`、横向 pitch 为 `54px`
And 首屏显示1～10、末屏显示11～20。

Given 首屏已显示
When hover 5，再 hover 10
Then hover 5保留首屏并显示5号hover状态
And hover 10只改变10号chip视觉状态，track位置保持不变，不能触发左右滑动。

Given 末屏已显示
When hover 15，再 hover 11
Then hover 15保留末屏并显示15号hover状态
And hover 11只改变11号chip视觉状态，track位置保持不变，不能触发左右滑动。

Given 已完成左右导航
When 点击 `CloseOutlined`
Then overlay减少且 dismiss verification 为 `verified`
And 返回固定分值20项表单，不产生保存/提交/删除写入。

证据与状态映射见 `fixed-score-options-20-capture-contract.json`；step_05/step_09中采集环境产生的track偏移标记为observed-not-target，不作为实现断言；本variant的rendered contract、截图diff和像素验收保持 `not-run`。

### AC-07P5A 多页顺序导航

Given 固定分值选项实际内容超过两个可视页
When 连续点击`RightOutlined`
Then 每次只推进到下一页
And 中间页同时显示`LeftOutlined`和`RightOutlined`
And 到最后一页后只显示`LeftOutlined`

Given 当前位于最后一页
When 点击`LeftOutlined`
Then 返回上一页而不是直接跳回第一页
And 返回中间页时左右按钮同时显示。

实现验证：`FixedScorePreviewNavigator.spec.ts`、`FixedScoreOptionsEditor.spec.ts`、`ReviewRulePreviewModal.spec.ts`、`ReviewRuleForm.spec.ts` 共28 tests passed；`npm --prefix hr-portal/frontend run build` passed。该结果只证明组件结构与行为测试通过，不替代本variant的浏览器几何和像素验收。

## AC-07P6 固定分值校验

Given 固定分值选项存在 `1` 和 `1.00`
When 触发预览或提交校验
Then 两行输入框下方均显示 `分值重复`
And 不产生 preview 或 submit 事件。

Given 固定分值为 `-1.25`
When 触发预览校验
Then 负数被保留为合法值。

Given 固定分值超过 `1,000,000,000,000,000`
When 触发预览或提交校验
Then 对应输入框下方显示 `不可超过 1,000,000,000,000,000`
And 不产生 preview 或 submit 事件。

Given 固定分值为 `-0.555`
When 触发校验
Then 显示 `最多支持2位小数`
And 不产生 preview 或 submit 事件。

Given 重复或超限错误已修正
When 再次触发预览
Then 错误消失
And 负数合法值进入只读 preview payload。

证据：组件/表单自动化测试；真实页面截图与像素验收仍为 `not-run`。

## AC-08 Footer 与键盘状态

Given footer 可见  
When 依次 hover/focus 提交、预览、取消及关键表单控件  
Then 匹配 footer hover states、`RR-SUBMIT-FOCUS`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`；footer高48px，第一个按钮与800px表单左边缘对齐，三个按钮x为560/652/744（1920目标），水平间距只有一个12px来源，不得叠加gap与Element Plus相邻按钮margin。

## AC-09 SVG

Given 渲染新建、筛选、搜索、返回、拖拽、删除和添加控件
When 检查 SVG
Then data-icon、viewBox、path、currentColor、bbox 和命中区域与 component model/target contract 一致；禁止近似图标。可用状态的每个 named data-icon/checked-checkbox 实例必须回溯到 `extracted-ui-contract.json` 的 `source_state_id`、target selector 和 `target_contract.json#/bbox_inventory/{index}`，不得以 intrinsic size 充当页面 bbox。

当前证据：全部 23 个 source state 的 528 个 SVG 实例均具备真实 target-level bbox；`RR-LIST-20-ROWS` 使用补采 session `idreamsky.feishu.cn_20260826_194044_893758` 的 `captures/initial/target_contract.json`，该 target contract 由真实 layout SVG bbox 与 after.html 复核生成。T00-E05、T00-E06、T00-E07、T00-E08 已通过；备注 textarea resize 三阶段证据和评分空间分析已完成。预览 CloseOutlined/数字控件图标均有结构化证据；严格全屏截图 diff 仍失败，不得将像素验收改写为通过。

## AC-11 使用状态、删除与受限编辑

详细契约见 `usage-aware-edit-delete-contract.md` 的 AC-U01 至 AC-U06。验收至少覆盖：未使用规则全量编辑与软删除；普通题/子题统一判定；已使用删除的 not-allowed 命中区与固定提示；评级、评分、评分映射三类字段矩阵；绕过前端直接修改锁定字段时后端返回 409；更新/删除与评估题绑定使用同一规则行锁避免竞态。

## AC-10B 预览运行时验收

- `capture_review_rule_preview.py` 在 Chrome CDP、1920×1080、DPR1、light、fonts-loaded 环境生成 9 个 actual PNG 和 runtime snapshots。
- `compare_preview_contract.py` 实际结果：`passed`；modal root/header/body、CloseOutlined path/bbox、评分/映射 preview input 关系均在 ±1px 内。
- `compare_preview_screenshots.py` 实际结果：`failed`；`channel_tolerance=3`、`max_diff_pixel_ratio=0.01`，9/9 目标/实现/diff 文件均生成，但全屏差异比例受目标截图水印和字体栅格差异影响，不能宣称 `pixel_status=passed`。

## AC-10 功能测试与构建

实现后运行并记录真实结果：

```text
cd hr-portal/frontend
npm test -- src/views/performance/ReviewRuleManagement.spec.ts src/views/performance/ReviewRuleCreatePage.spec.ts
npm run build
```

截图对比命令及实际结果见 AC-10B：9 组截图/diff 已生成，严格全屏像素差异为 failed；当前 T06 仍 blocked，不把结构/几何 compare 或单测/build 代替像素验收。

### AC-10A Header Alignment

Given a 1920x1080, DPR1, 100% zoom rule-list viewport
When checking the white card and all six table headers
Then the card is `x=260,width=1640px`, the table starts at `x=280px`, and the six header cells match target x=`280/487/694/970/1245/1659`, width=`207/207/276/276/414/221px`; an outer scrollbar must not reduce the card to 1630px.

And the visible header titles start at x=`292/499/706/982/1257/1671`, with exactly one 12px left-padding source on the TH. The Element Plus inner `.cell` must not add another 12px.

Implementation evidence must also show that the performance admin route overrides the repository-wide stable root gutter and that the rendered `colgroup` geometry, rather than only declared `min-width` props, produces the required bboxes.

2026-08-26 result: passed for the list header. Container sessions `localhost_8080_20260826_122947_794239` and `localhost_8080_20260826_124144_914762` measured card `x=260,w=1640`, exact header x/width sequences, and exact inner title x/y/height/padding/font sequences required above. This does not mark the remaining create/edit/form states or PM-T006-T06 as complete.

## T00-E07 双向覆盖与冲突检查

- 检查对象：`extracted-ui-contract.json`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`atomic-tasks.md`、`capture-manifest.md`、`capture-completion-checklist.md`。
- source state 双向覆盖：23 个 JSON state 均能回溯 `capture-manifest.md`，组件模型覆盖全部 23 个状态；验收契约和原子任务对未逐条展开的状态由本节统一索引：`RR-LIST-DEFAULT`、`RR-LIST-20-ROWS`、`RR-NEW-HOVER`、`RR-EDIT-HOVER`、`RR-EDIT-PREFILLED`、`RR-CREATE-RATING`、`RR-SUBMIT-HOVER`、`RR-PREVIEW-HOVER`、`RR-CANCEL-HOVER`、`RR-ADD-LEVEL-HOVER`、`RR-LEVEL-INLINE-ADD`、`RR-MAPPING`、`RR-INTERVAL-HOVER`、`RR-INTERVAL-INLINE`、`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`、`RR-SCORE`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`、`RR-SUBMIT-FOCUS`。
- 组件覆盖：JSON 的 9 个组件均在 `component-model.md` 的组件树/契约中存在；业务状态使用的 `ReviewRuleTable`、`PageHeader`、`FullScreenModal`、`ReviewRuleForm`、`ReviewTypeRadioGroup`、`ScoreConfig`、`ScoreMappingConfig`、`LevelConfigEditor`、`FixedActionBar` 均无孤立项。
- 交互覆盖：23 个状态的 36 条 interaction 均已对象化；每项具备 `kind`、`semantic_state`、`target`、`phases`、`before`、`after`、`action`，并保留真实 evidence 路径。
- SVG 覆盖：23 个状态的 528 个 SVG 实例均保留 `source_state_id`、target selector 和 target contract pointer；`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空。
- 可测关系：JSON 的 5 条 `layout_relations` 均来自同一 source state 的 target contract/interaction evidence，未跨状态推断。
- 结果：**基础状态与预览状态的 E07 双向覆盖通过**。主契约 47 个状态 visual inventory 非空；`coverage.unmapped_*`、`cross_document_conflicts`、`missing_terminal_anchors`、`uncompared_variant_groups`、`unmapped_containers` 均为空。预览 rendered contract 几何 compare 已通过；截图 diff 单独保持 failed，不影响 E07 结构审计，但阻塞 PM-T006 像素完成。
