# PM-T004-T06 评估内容抽屉与新建弹窗蓝图

版本：`v3-capture-validation-save`

状态：`implemented; acceptance blocked by unrelated repository typecheck`（2026-08-21）。用户已明确要求按本版本完成正式开发；实现截图、focused tests、Vite build 与响应式几何已完成，仓库级 typecheck 仍被任务范围外错误阻断。

覆盖任务：`PM-T004-T06`。

## 1. 权威依据与证据边界

视觉与交互证据按以下优先级使用：

1. 校验恢复 session `idreamsky.feishu.cn_PM-T004_rating_recovery_final_20260821_201837` 中的重复评级、有效选项恢复、成功确定与 `validation_coverage.json` 证据。
2. 模板保存 session `idreamsky.feishu.cn_PM-T004_validation_save_final_20260821_201333` 中的可信保存点击、两个 PUT 契约、响应与成功反馈证据。
3. 扩展采集 session `idreamsky.feishu.cn_PM-T004_contract_focus_responsive_20260821` 中的取消、焦点顺序和响应式证据。
4. 补充采集 session `idreamsky.feishu.cn_PM-T004_supplemental_20260821` 中对应状态的 `after.png`、`layout.json`、`computed.json`、`overlay.json`、`interaction.json`。
5. 原始采集 session `idreamsky.feishu.cn_20260821_140802` 中的页面上下文与抽屉入口。
6. 本蓝图对已采集事实的归纳。
7. HR Portal 现有设计组件，仅用于实现已确认结构，不得覆盖采集事实。

采集环境统一为 `1920×1080`、DPR `1`、浏览器缩放 `100%`。未在采集物中测得的尺寸、颜色、动效时长、焦点顺序或窄屏行为不得猜测；实现前应回读对应状态 JSON，仍无证据则登记为阻塞项并向用户补采。

原始 HTML、截图、日志和采集目录只作本地证据，不提交 Git。任何认证、存储或会话数据不得写入 Spec。

## 2. 范围与非范围

### 范围

- “选择评估内容”右侧抽屉及可见性开关。
- “新建”按钮、创建类型菜单和三个菜单项。
- 新建工作总结、新建评分评级、新建自定义三个双栏弹窗。
- 表单即时预览、必填校验、添加、删除、拖拽排序。
- 工作总结/自定义文本预览的富文本工具栏。
- 评分评级选择器、自定义文本/标签模式、标签默认全部填写。
- Esc、遮罩、关闭按钮、取消、确定及创建成功后的抽屉状态；取消语义以第 13 节三类已采集路径为准。

### 非范围

- 真实内容保存 API、数据库、权限、审计与跨会话持久化。
- 评级项和标签项的数据源 API 实现。业务来源已确认为“飞书绩效设置 -> 评估题管理”；本任务只保留可注入 API adapter 接口和测试 fixture，接口实现由后续任务完成。
- “设置分组”的后续分组配置流程。
- “添加提示”弹窗及其后端契约。
- 采集未覆盖的移动端、窄屏重排与浏览器缩放适配。

## 3. 状态机

```text
drawer-empty (visibility=on)
  -> click 新建
create-menu-open
  -> choose 工作总结 | 评分评级 | 自定义
type-modal-open
  -> edit / validate / add / delete / reorder / preview
  -> cancel | close | Esc => drawer-empty
  -> mask click => modal remains open
  -> valid confirm => success feedback + drawer-populated
```

- 抽屉可见性开关初始为开启。关闭后隐藏“设置分组”并恢复抽屉空态；再次开启恢复“设置分组”。
- 点击“添加”会保存当前填写项，并立即在配置栏末尾追加一个空白填写项。成功确定前必须不存在未完成的自动追加空白项；采集路径通过删除该空白项后成功确定。
- 拖拽中配置栏顺序先变化，预览在释放鼠标后同步最终顺序。

## 4. 抽屉与创建菜单

### 抽屉

- 右侧抽屉宽 `680px`，目标坐标 `x=1240–1920`，覆盖完整 `1080px` 视口高度。
- Header 高 `58px`，标题为“选择评估内容”，包含关闭按钮。
- 首区文案为“评估内容分人群可见”和“分组后，可根据不同人群评估要求，设置对应的评估内容”。
- 可见性开关为 `28×16px`，初始开启；开启时显示“设置分组”。
- 空列表显示“暂无内容”。
- “新建”为 `80×32px` 命令按钮。

### 创建菜单

- 点击“新建”后出现垂直菜单，不得把三个类型永久平铺在抽屉中。
- 菜单依次显示“工作总结”“评分评级”“自定义”。每行约 `72×30px`；最终坐标、padding、边框、阴影、字体和 hover 状态必须取对应采集 JSON，不得凭组件默认值推断。
- 选择菜单项后打开对应弹窗，抽屉保留在底层。

## 5. 三类弹窗共用壳层

- 弹窗均为水平居中的 `1080px` 双栏布局，左侧为“配置详情”，右侧为“预览”。
- 工作总结目标尺寸 `1080×650px`；评分评级 `1080×559px`；自定义 `1080×722px`。纵向位置按 1920×1080 截图居中结果和对应 `layout.json` 还原。
- Header 显示对应标题与右上角关闭按钮；Footer 按钮视觉顺序为“取消”“确定”。
- “确定”初始可点击，不以 disabled 代替校验。空表单点击确定后，必填字段显示红色边框和红色“此项为必填”。
- 弹窗内容超过可用高度时只滚动采集显示的内部内容容器，Header/Footer 不得随意改为整页滚动；具体 overflow 容器以 `layout.json`、`computed.json` 为准。
- `Esc` 关闭弹窗；点击遮罩不关闭；右上角关闭按钮关闭并回到抽屉。
- 三类“取消”均关闭弹窗且不创建内容；焦点回到“选择评估内容”抽屉根对话框。重新打开同类弹窗时，临时名称草稿已清空，其余字段恢复各自初始值。取消只产生遥测、用户设置等非内容保存请求，没有观察到内容写入请求。

## 6. 新建工作总结

- 左栏字段：名称*、描述、配置详情、填写项、填写题名称*、提示、添加。
- 名称、描述、填写题名称和提示即时驱动右侧预览。
- 点击添加后形成一个可排序填写项，并自动追加一个空白填写项。
- 已添加项显示拖拽手柄与删除操作。删除只移除对应项，不改变其他项内容。
- 两项排序采集结果：`First item, Second item` 拖拽后变为 `Second item, First item`。
- 右侧预览为真实富文本输入区，不得用普通 textarea 模拟工具栏。

## 7. 富文本工具栏

- 工具顺序固定为：加粗、斜体、下划线、有序列表、无序列表、链接。
- 每个按钮具有默认、hover/tooltip 和 active 状态；采集分别覆盖加粗、斜体、下划线、有序列表、无序列表、链接 hover，以及除链接外的格式 active 状态。
- 链接按钮在有选中文本时打开 URL 输入浮层。浮层几何、阴影、输入样式与定位必须读取 `16e_editor_link_popover` 证据。
- 格式操作需作用于当前选区，并在失焦到工具栏后恢复编辑器选区语义。

## 8. 新建评分评级

- 左栏字段：名称*、描述、配置详情、评估项、选择器、添加。
- 打开选择器时渲染采集中的评级选项。若模板已经使用某评估项，该项保留在列表中但显示禁用态；本次重复项“绩效评级”具有 `ud__select__list__item-disabled` 状态，交互提示为“模板中已存在该评估项”，点击后不写入选择器。
- 重复项未选中时点击确定，选择器显示红色边框和“评估项为必填”。改选已确认可用的测试项后，重复提示和必填错误消失，配置栏显示所选项，右侧即时渲染对应评级 pill；成功确定关闭弹窗、显示“新建成功”并回填抽屉。
- 评级选项属于“飞书绩效设置 -> 评估题管理”维护的租户业务数据，不是产品常量。T06 仅定义并消费可注入 API adapter 接口；后续评估题管理开发完成后再接入真实 API，focused test 暂用 fixture。禁止把采集租户的选项列表硬编码进通用组件。
- 一个“评分评级”内容块只绑定一个评估项。新建或编辑时切换选择必须替换旧评估项，不得在隐藏的 `items[]` 中累加；确认后 `ratingOptionId`、唯一 item、等级选项及颜色必须指向同一最终评估题。
- 配置填写内容预览读取最终评估题的当前规则等级；项目启动时将同一组等级和颜色冻结进节点快照，实际填写页不得使用固定五档或残留旧评估项。
- 评估题的题目级展示方式同步保存为 `ratingDisplayMode`：标签样式显示连接评级标签，下拉样式显示等级下拉框；弹窗预览和配置填写内容必须复用 `PerformanceRatingControl`。
- 空值确定、选择器展开、选择后预览分别以 `02`、`05`、`06` 状态为依据；重复项及恢复状态以 `PM-T004_rating_recovery_final_20260821_201837` 的 `step_07/after`、`step_08/after`、`step_09/after` 为依据。

## 9. 新建自定义

- 左栏字段：名称*、描述、配置详情、填写题类型*、填写题名称*、提示、添加。
- 填写题类型至少包含文本型和标签型；切换类型时只显示该类型已采集的配置项。
- 文本型预览复用第 7 节富文本编辑器行为。
- 标签型选择器采集到三个候选项：价值贡献、投入度、价值观，并包含各自说明。它们同样来自“评估题管理”，必须通过与评级项一致的可注入 API adapter 或 fixture 提供，不得硬编码为通用产品常量。
- 选择“价值贡献”后显示“默认全部填写”开关。开启后自动勾选“做得好的”“待改进的”，并向右侧预览填入对应默认内容。

## 10. 校验、成功与数据边界

- 名称及各类型标记 `*` 的字段是必填；空值点击确定后才显示 inline 错误。
- 因“添加”自动生成空白项，存在空白项时确定应继续显示该项必填错误；删除空白项后才可成功。
- 成功确定关闭弹窗，抽屉显示“新建成功”反馈并由空态切换为已创建内容状态。
- 采集中的成功确定只观察到 telemetry POST，没有业务保存 endpoint。实现不得据此发明保存 URL、DTO 或持久化成功语义；T06 只保证当前前端会话内的 UI 状态转换。

## 11. 采集证据矩阵（36/36）

| 状态组 | 证据目录 | 冻结内容 |
|---|---|---|
| 空值校验 | `01_work_empty_confirm`、`02_rating_empty_confirm`、`03_custom_empty_confirm` | 三类初始态、确定可点击、必填错误 |
| 工作总结填写/添加 | `04_work_filled_preview`、`08_work_after_add_one`、`09_work_after_add_multiple` | 输入预览、添加一项/多项、自动空白项、删除入口 |
| 评级 | `05_rating_selector_open`、`06_rating_selected_preview` | 选择器和七级预览 |
| 自定义标签 | `07_custom_tag_selected`、`07b_custom_tag_selector_open`、`07c_custom_tag_selected_value`、`15_custom_tag_default_all_on` | 标签模式、候选说明、选中值、默认全部填写 |
| 抽屉开关 | `10a_visibility_initial_on`、`10b_visibility_off`、`10c_visibility_on_again` | 初始开、关闭、再次开启 |
| 成功/关闭 | `11_confirm_success_drawer`、`12_escape_close`、`13_mask_close`、`14_close_button` | 成功回填、Esc、遮罩不关闭、关闭按钮 |
| 富文本基础 | `16a_editor_bold_hover`、`16b_editor_focus_and_content`、`16c_editor_bold_active`、`16d_editor_ordered_list_active`、`16e_editor_link_popover` | 输入、hover、active、链接浮层 |
| 富文本其余状态 | `16f_editor_italic_hover`、`16g_editor_underline_hover`、`16h_editor_ordered_hover`、`16i_editor_unordered_hover`、`16j_editor_link_hover`、`16k_editor_italic_active`、`16l_editor_underline_active`、`16m_editor_unordered_active` | 工具提示与激活态 |
| 拖拽排序 | `17a_drag_two_items_ready`、`17b_drag_handle_hover`、`17c_drag_in_progress`、`17d_drag_after_drop` | 初始顺序、手柄 hover、拖拽中、释放后同步 |

每个目录均应包含并交叉使用 `after.png`、`after.html`、`layout.json`、`computed.json`、`overlay.json`、`interaction.json`；不能只看截图推测 DOM 或交互。

## 12. 像素验收规则

- 在 `1920×1080`、DPR 1、100% 缩放下逐状态重放，并对目标 `after.png` 与实现截图做同尺寸叠加/差分。
- 抽屉、菜单、三个弹窗、选择器/链接浮层、错误态、开关态、富文本状态、拖拽态和成功态均须有独立实现证据；不可用目标采集截图冒充实现证据。
- 已测量的外框尺寸和坐标偏差不得超过 1 CSS px；文字不得截断或遮挡。未测参数以对应 computed/layout 数据为准，不允许用肉眼近似替代。
- 颜色、字体、边框、阴影、间距和图标需逐层比对；存在肉眼可见差异即不通过，需记录差异而不是宣称像素级一致。
- 建议独立实现截图命名：
  - `PM-T004-T06-select-assessment-content-drawer.png`
  - `PM-T004-T06-create-menu.png`
  - `PM-T004-T06-new-work-summary-modal.png`
  - `PM-T004-T06-new-rating-modal.png`
  - `PM-T004-T06-new-custom-modal.png`
  - `PM-T004-T06-validation-and-reorder.png`
  - `PM-T004-T06-rich-text-states.png`
  - `PM-T004-T06-confirm-success-drawer.png`

## 13. 取消、键盘与响应式扩展采集（24/24）

扩展 session：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_PM-T004_contract_focus_responsive_20260821\`。共 24 个状态，每个状态均有 `after.png`、`after.html`、`layout.json`、`computed.json`、`overlay.json`、`interaction.json`，缺失为 0。

### 取消语义

| 类型 | 取消结果 | 重新打开 | 焦点结果 |
|---|---|---|---|
| 工作总结 | 弹窗关闭，不创建内容 | 临时名称草稿清空，表单恢复初始值 | 抽屉根 `role=dialog` |
| 评分评级 | 弹窗关闭，不创建内容 | 临时名称草稿清空，表单恢复初始值 | 抽屉根 `role=dialog` |
| 自定义 | 弹窗关闭，不创建内容 | 临时名称草稿清空，单选项恢复初始选中值 | 抽屉根 `role=dialog` |

证据目录为 `cancel_<类型>_before/after/reopen`。取消期间未发现内容保存请求；遥测和通用用户设置请求不属于 T06 业务契约。

### 实际 Tab 焦点顺序

- 工作总结：关闭按钮 -> 名称 -> 描述 -> 填写题名称 -> 提示 -> 添加 -> 加粗 -> 斜体 -> 下划线 -> 有序列表 -> 无序列表 -> 链接 -> 富文本编辑区；再次 Tab 仍停留在富文本编辑区，无法到达 Footer。
- 自定义文本型：关闭按钮 -> 名称 -> 描述 -> 文本型 radio -> 标签型 radio -> 填写题名称 -> 提示 -> 添加 -> 六个富文本工具 -> 富文本编辑区；再次 Tab 仍停留在富文本编辑区，无法到达 Footer。
- 评分评级：关闭按钮 -> 名称 -> 描述 -> 评级 combobox -> 添加 -> 确定 -> 取消，随后焦点逸出弹窗并进入后台页面导航、向导按钮和内容区按钮。
- 以上是目标页面的真实采集行为，不自动等同于 HR Portal 的无障碍验收要求。用户已确认不照搬富文本停滞和焦点逸出缺陷：HR Portal 实现必须按 Spec 012 提供完整 modal focus trap，关闭后将焦点返回触发元素，视觉保持与目标页一致。

### 非 1920×1080 响应式行为

| 视口 | 抽屉 | 三类弹窗外框 |
|---|---|---|
| 1440×900 | `x=760,w=680,h=900`，Header 58，内容高 842 | `x=180,y=32,w=1080,h=836` |
| 1366×768 | `x=686,w=680,h=768`，Header 58，内容高 710 | `x=180,y=32,w=1006,h=704` |
| 1280×720 | `x=600,w=680,h=720`，Header 58，内容高 662 | `x=180,y=32,w=920,h=656` |

- 抽屉在三个视口下始终固定 `680px` 并右贴边，不缩为全屏。
- 弹窗在 1440px 宽时仍为 `1080px`；更窄时保持左右各 `180px`，宽度为 `viewport - 360px`。三个低高度视口均保持上下各 `32px`，高度为 `viewport - 64px`。
- 低视口下 Header/Footer 保持可见，表单和预览在中间可用区内压缩/滚动；不得让整个弹窗超出视口或遮住 Footer。
- 本轮只冻结桌面 1440×900、1366×768、1280×720；低于 1280px 和移动端仍无证据。
- 2026-08-21 人工被动采集使用系统 Google Chrome `151.0.7922.140`；当前笔记本逻辑屏幕为 `1280×800`、DPR `1.5`，最大化 Chrome 的真实网页 viewport 为 `1280×673`。该基线只用于证明可见采集窗口已跟随屏幕，不冒充上表三类弹窗的响应式状态证据。

## 14. 正式保存成功契约

- 采集器安全策略禁止自动点击“保存/提交/确定/下一步”等写操作；所有写入候选动作均由用户在可见 Chrome 中执行，采集器仅被动记录并脱敏。
- 弹窗“确定”仍只更新当前向导会话的前端状态；校验恢复 session 除通用 `POST /perf/api/user/custom_settings` 外没有内容业务写请求。
- 模板保存 session `idreamsky.feishu.cn_PM-T004_validation_save_final_20260821_201333` 由用户在可见 Chrome 中真实点击预览页“保存”，采集到同一动作关联的两个成功请求：
  - `PUT /perf/api/review/v2/template_groups/{template_group_id}/detail`：保存完整模板详情。请求顶层包含 `frontend`、`templates`、`units`、`ref_indicator_ids`、`ref_kpi_template_ids`、`custom_page_units`、`key_indicator_id(s)`、`stage_configs`、`stage_groups`、`stage_refs`、`specific_group_config`、`scenes`、`primary_unit_id`、`hints` 和计算规则支持标记。`frontend` 使用 `data/entities/behaviors/version/usedEntities` 图结构；评估项位于 `entities.templateItem/entry`，评级 entry 的 `type` 为 `indicator`，通过 `extra.indicator` 引用评估题 ID。
  - `PUT /perf/api/review/v2/template_groups/{template_group_id}`：保存模板组基础信息，请求字段为 `name`、`description`、`langs`、`support_computation_rule`、`scenes`。
- 两个请求均返回 HTTP 200，结构均为 `{"code":0,"data":{},"msg":"操作成功","success":true}`。成功后页面返回绩效模板列表并显示“修改成功，预计 1 分钟后生效”。
- `POST /perf/api/user/custom_settings`、`POST /perf/api/user/licenses` 和 Risk Insight 请求属于通用查询或安全基础请求，不是模板保存契约。
- 本轮只证明成功保存契约；失败状态码、错误反馈、幂等/并发、延迟生效后的重新打开一致性仍未采集，不得从成功响应推断。

## 15. 实现前仍需确认

- 评级项与标签项来源已确认为“评估题管理”；真实读取 API 尚未开发。T06 先保留 adapter 接口并用注入 fixture 完成纯 UI，不得把租户数据写成通用常量。
- 模板级成功保存请求和成功反馈已采集，但保存 API 实现、失败反馈、幂等/并发及延迟生效后的重新打开语义不属于 T06；后续纳入时必须单独建立契约任务，不得把目标租户的大型图 payload 直接复制为 HR Portal DTO。
- 键盘行为已确认按 Spec 012 修正为完整 modal focus trap，不照搬目标页的富文本停滞/焦点逸出，视觉保持不变。
- 低于 1280px、移动端和其他缩放比例仍无响应式证据，不在本版本承诺范围。

## 16. 蓝图确认记录

- 2026-08-21：补充采集 36/36 状态完整，形成 `v1-capture-complete`。
- 2026-08-21：扩展采集 24/24 状态完整，补齐三类取消语义、Tab 焦点链及 1440/1366/1280 桌面响应式，形成 `v2-capture-extended`。
- 2026-08-21：人工被动采集确认真实 Chrome 窗口基线及“新建成功”为前端会话状态；通用用户设置请求已排除，模板级保存契约仍待明确终点后补采。
- 2026-08-21：混合校验采集确认重复评级禁用提示、必填阻断、有效项恢复、评级预览和“新建成功”；该分支不产生内容业务写请求。
- 2026-08-21：可信用户点击预览页“保存”，补齐模板详情 PUT、模板组基础信息 PUT、HTTP 200 响应和“修改成功，预计 1 分钟后生效”，形成 `v3-capture-validation-save`。
- 2026-08-21：用户明确要求“完成正式开发”，确认抽屉、菜单、三类弹窗、校验、增删排序、预览、富文本、关闭与成功状态按 `v3-capture-validation-save` 实施。
- `PM-T004-T06` 仍须在代码、focused tests、类型检查、生产构建和实现截图差分全部通过后才可标记 `[x]`。

## 17. 实现验收记录

- 实现组件：`hr-portal/frontend/src/components/performance/PerformanceAssessmentContentLayers.vue`；页面入口：`hr-portal/frontend/src/views/performance/PerformanceTemplateContentSettings.vue`。
- 八张独立实现证据已生成：`PM-T004-T06-select-assessment-content-drawer.png`、`PM-T004-T06-create-menu.png`、三个 `new-*-modal.png`、`PM-T004-T06-validation-and-reorder.png`、`PM-T004-T06-rich-text-states.png`、`PM-T004-T06-confirm-success-drawer.png`。
- Playwright 外框验收通过：1920×1080、1440×900、1366×768、1280×720 的抽屉均为右贴边 680px；弹窗分别为 `1080×650`、`1080×836`、`1006×704`、`920×656`，已测坐标与蓝图一致且 Footer 未裁切。
- `PerformanceAssessmentContentLayers.spec.ts` 与 `PerformanceTemplateContentSettings.spec.ts` 共 16 项 focused Vitest 通过；覆盖三类入口、校验、重复评级恢复、自动空白卡阻断、删除/拖拽、标签默认填写、富文本、取消/遮罩、焦点陷阱、Esc、成功回填和页面集成。
- `npx.cmd vite build` 通过，2579 modules transformed，35.22s；最新构建已更新到 `localhost:8080` 开发容器，真实本地账号 smoke 通过模板 17 的抽屉入口链。`npx.cmd vue-tsc --noEmit` 被无关 `src/views/tools/TableMerge.vue:405` 的既有 `output_fields` 缺失错误阻断，T06 文件未报告新类型错误。
- 本任务未新增真实评估题 API、保存 API、数据库、migration、权限、UCP、外部系统或租户常量；评级/标签仍由 props adapter 边界注入。
- 2026-08-22 富文本同会话补采与 F03 验收：三行选区按目标 DOM 生成三个独立列表块，有序→无序切换严格互斥，加粗/斜体/下划线可兼容，无序圆点为 `6×6px #3370ff`。真实容器入口截图为 `PM-T004-T06-F03-implemented-rich-text-list.png`；focused Vitest `18/18` 和 Vite 生产构建通过，仓库级 typecheck 仍只被范围外 `TableMerge.vue:405` 阻断。
