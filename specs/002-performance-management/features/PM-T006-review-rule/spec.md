# PM-T006 评估规则（Review Rule）

> 规格状态：T00-T05P已完成结构/行为与运行时几何比较；T06P/T06像素截图 diff 仍 blocked（严格全屏 diff 受目标水印与字体栅格差异影响）。
> completion_status: incomplete
> pixel_restore_status: blocked
> ui_confirmation_status: confirmed
> 模式：前端像素级还原；mock 数据、后端、权限、数据模型和迁移不在范围

## 1. 目标与范围

还原飞书绩效“评估规则”功能：

- “评估题”页面中的“评估规则”tab；
- 规则列表、搜索、筛选、分页和编辑/删除状态；
- 新建与编辑全屏页面；
- 评级、评分、评分映射等级型；
- 等级列表和分数子区间内联新增；
- 校验、hover、focus、checked、disabled、滚动、SVG 和像素验收。

非范围：后端 API、权限、数据模型、迁移、真实业务保存和 mock 记录数量。

## 2. 权威证据

- 证据索引：`capture-manifest.md`
- 采集完成清单：`capture-completion-checklist.md`
- 组件与状态机：`component-model.md`
- 机器可校验提炼契约：`extracted-ui-contract.json`
- 几何与视觉：`pixel-contract.md`
- Given/When/Then：`acceptance-contract.md`

23 个稳定 `source_state_ids` 已映射到采集证据包；列表补充了 10 行 `1280×639/DPR1.5` 与 20 行 `1920×1080/DPR1` 增长证据。

## 3. 列表页

- 页面标题：“评估题”；
- tab：“评估题 / 评估规则 / 更多”，评估规则选中；
- 工具栏：新建、搜索 `通过名称、备注搜索`、筛选；
- 表格列及真实 colgroup：

| 列 | 宽度 |
| --- | ---: |
| 名称 | 120px |
| 评估方式 | 120px |
| 创建人 | 120px |
| 创建时间 | 160px |
| 备注 | 240px |
| 操作 | 128px |

原实现中的固定列宽与旧比例推导均不作为目标依据；目标列位置和宽度以 `RR-LIST-DEFAULT` 采集的实际 header bbox 为准。编辑为可用蓝色链接；当前真实数据的删除为 disabled 灰色；单页分页左右按钮 disabled。

### 3.1 列表高度与滚动模型

列表高度不得由 `ReviewRuleTable` 固定撑开。目标实现为：

```text
外层使用当前视口可用高度，`min-height:0`，不得设置768px人工下限
→ 白卡片 flex: 1 1 0%，先使用真实剩余视口空间
→ table-wrapper 按表头、行数和分页自然增长
→ 内容超过下限时白卡片继续增高
→ .content.container-padding 负责纵向滚动
```

采集公式：

```text
tableWrapperHeight ≈ 140px + rowCount × 49px
whiteCardHeight = max(剩余视口高度, tableWrapperHeight + 56px)
```

其中 `56px = top padding 20 + pagination bottom margin 16 + bottom padding 20`。

- 10 行、1280×639/DPR1.5：table wrapper 626px，内容将 full-height frame 撑至768px、white card撑至682px；768是结果高度，不是min-height。
- 20 行、1920×1080/DPR1：table wrapper 1120px，white card 1176px，tbody 980px；外层内容 scrollHeight/clientHeight=1302/1024，最大滚动距离 278px。
- 表头高度约 48px，行高约 49px；表头白底。
- 分页始终存在；0 行显示“共 0 条 / 1 / 10 条/页”并禁用前后页。
- 禁止给列表页设置 `min-height:768px`，禁止通过 `min-height:800px` 撑大表格，禁止 `max-height:600px` 建立表格内部纵向滚动。

## 4. 新建/编辑页面

- 容器：1920×1080 `full-screen-modal`，fixed，z-index 100；
- header：56px，SpaceLeftOutlined + 返回 + divider + title；
- content：y=56、h=1024、overflow auto；内容超高时 8px scrollbar；
- 表单：居中 800px，按卡片分组；
- footer：absolute bottom，48px，z-index 10；提交/预览/取消均为 80×32，间隔 12px。

编辑页通过真实行操作进入 `{id}?from`，与新建页共用表单结构，但标题为规则名称、字段预填、评估类型不可切换。

## 5. 基础信息

| 字段 | 控件 | 契约 |
| --- | --- | --- |
| 语言 | square checkbox group | 中文默认选中且视觉置灰；英文未选 |
| 名称 | input | placeholder `请输入名称`；必填 |
| 评估类型 | radio group | 顺序与默认：评级（默认）/评分/评分映射等级型 |
| 备注 | textarea | 精确 placeholder；0/2000 |

## 6. 评级

- 评级可参与计算 switch，默认关闭；开启后配置等级新增必填“量化分”列，并保留原“量化值”列；详细开发契约见 `quantified-rating-contract.md`；
- 配置等级说明、列：颜色与等级 / 名称 / 量化值；
- 每行：drag handle、颜色、等级代号、等级名称、量化值、删除；
- create 默认 3 行；编辑真实状态 7 行；
- 点击“添加等级”直接增加内联行，**不打开弹窗**；
- 空提交显示名称和等级代号必填错误。

## 7. 评分

- 评分方式：
  - 在分数上下限内输入评分；
  - 在固定分值选项内选择评分。
- 评分上下限：分数下限 / 分数上限；
- 小数位数：不保留 / 1 位 / 2 位。

## 8. 评分映射等级型

- 评分方式：在分数上下限内输入评分；
- 评分上下限；
- 区间规则：`a ≤ 分数 < b` / `a < 分数 ≤ b`；
- 区间表头同一行显示 `分数子区间 * / 等级代号 * / 等级名称`；“分数子区间”跨下限、运算符和上限三列，表头不覆盖删除列；
- 区间行：上下限、等级代号、等级名称、删除；第 1 行开始值自动等于评分下限，最后 1 行结束值自动等于评分上限；所有行左侧边界只读，第 2 行起左侧值自动等于上一行右侧边界；
- 默认 2 行，点击添加后内联变为 3 行，新增行始终插入倒数第二行；
- 左侧派生边界和最后一行结束值不允许手动输入；中间右侧边界可编辑；
- 等级代号 maxlength=12，等级名称 maxlength=40；
- 首行左侧和末行右侧按区间规则 disabled；其余左侧边界为 readonly 派生值；
- 小数位数：0/1/2 位；所有区间数字输入最小值为 0，步进分别为 1/0.1/0.01。

## 8.1 预览

- 三种评估类型共用 `ReviewRulePreviewModal`，不得复制三套modal DOM；
- 点击预览先执行类型专属校验，失败时显示行内错误且不打开modal；
- 评级覆盖非量化和量化预览；量化开关必须解析到真实switch并验证 `aria-checked=false→true`；
- 评分覆盖上下限方式和固定值选项方式；
- 评分映射覆盖初始预览及在预览内输入合法分数后的映射结果；previewValue只属于预览本地状态；
- 正常预览宽600；评级/评分高158，映射高358.667；关闭使用 `CloseOutlined` 并验证dismissed；
- 详细机器/开发契约：`preview-extracted-ui-contract.json`、`preview-development-contract.md`；
- 评分预览会话已在修复空间分析器后离线重建，`missing_terminal_anchors=[]`；预览运行时 rendered contract 几何比较已通过，当前仅因严格全屏 screenshot diff failed 保持 blocked。
- 2026-08-30 新增固定分值20项预览 variant 作为既有20/40目标的补充，覆盖1～20选项、首末窗口、hover 5/15、边缘hover 10/11视觉状态、左右导航及verified关闭；采集环境中的edge hover横向偏移标记为observed-not-target，正式环境hover不自动滑动。机器投影见 `fixed-score-options-20-capture-contract.json`。该variant的 rendered contract、截图diff和像素验收保持 `not-run`。

## 8.2 使用状态、删除与受限编辑

普通评估题或子评估题任一通过 `rule_id` 引用规则，即视为规则已使用。未使用规则可软删除并按新建页能力完整编辑；已使用规则禁止删除，并按评估类型实施字段级受限编辑。前后端契约、字段矩阵、并发和错误码见 `usage-aware-edit-delete-contract.md`。

后端必须实时派生 `is_used/deletable` 并校验更新前后差异；前端置灰或隐藏不能替代服务端保护。已使用删除提示固定为“此评估规则已被使用，不允许删除”，禁用命中区复用 `cursor:not-allowed` 系统交互。

## 9. 组件拆解

| 层级 | 组件 | 职责 | source_state_ids |
| --- | --- | --- | --- |
| 共享 | `PerformanceListPage` | 列表页面框架 | list states |
| 共享 | `PerformanceListToolbar` | 新建、搜索、筛选 | toolbar states |
| 共享 | `PageHeader` | 返回和 create/edit title；只提供通用header，不携带页面专属最小宽度 | form states |
| 共享 | `FullScreenModal` | fixed全屏壳、滚动和可选footer；默认按viewport布局，不携带模板页专属宽度 | form states |
| 业务 | `ReviewRuleTable` | 六列、分页、行操作 | list states |
| 业务 | `ReviewRuleForm` | create/edit 共用表单 | create/edit states |
| 业务 | `ReviewTypeRadioGroup` | 三种评估类型 | type states |
| 业务 | `LevelConfigEditor` | 评级等级行、拖拽、内联新增 | rating states |
| 业务 | `ScoreConfig` | 普通评分 | `RR-SCORE` |
| 业务 | `ScoreMappingConfig` | 评分映射等级型 | mapping states |
| 业务 | `ScoreIntervalEditor` | 区间行与内联新增 | interval states |
| 业务 | `FixedActionBar` | 提交、预览、取消 | footer states |
| 页面 | `ReviewRuleManagement.vue` | 列表组装 | list states |
| 页面 | `ReviewRuleCreatePage.vue` | create/edit 组装 | form states |

`AddLevelModal` 已删除：真实交互没有弹窗。

### 9.1 共享全屏组件原则

#### PageHeader

- 只负责56px白色header、返回控件、分隔线、title、subtitle/actions插槽。
- 默认 `min-width:0`，不得写入绩效模板页的1200px专属下限。
- 返回控件必须使用采集的 `SpaceLeftOutlined` 20×20及原始path。
- 页面标题由调用方传入；create/edit必须复用同一header组件。

#### FullScreenModal

- 默认契约：`position:fixed; inset:0; z-index:100; width/height=viewport; min-width:0; padding-top:56px; overflow:auto`。
- content默认 `min-width:auto`，只负责可滚动内容区，不决定业务表单宽度、卡片数量、卡片高度或字段布局。
- footer只负责48px操作栏和事件分发；按钮水平间距必须只有一个来源。目标使用每个按钮 `margin-right:12px`，不得同时叠加容器 `gap` 与 Element Plus `.el-button + .el-button` margin。
- 共享组件不得直接复制 `PerformanceTemplateCreate` 的 `min-width:1300/1200px`；模板页如需要宽屏下限，必须由模板页面显式提供variant/class/CSS变量。

#### 页面与共享组件边界

- `ReviewRuleCreatePage` 只组装共享壳、路由模式和 `ReviewRuleForm`，不得复制header/footer DOM。
- 800px居中容器、三张业务卡片和实际表单高度归 `ReviewRuleForm`/业务页面内容负责，不属于 `FullScreenModal`。
- T03只验收壳、header、content scroll、footer和路由；T04验收基本信息/类型配置/备注三张卡片。T03占位卡不得作为目标白色底框的像素证据。
- create/edit必须共用同一组件树，差异只来自mode、title、预填和可编辑状态。

## 10. 实现门禁

组件拆解已由用户确认，T00-T03 已完成。T03 create/edit共用全屏页面壳、共享header/footer、路由、返回链路和实际视觉复核均已通过。T02的PNG豁免与T03状态均不替代T06完整状态截图与最终diff。下一步开始T04表单与三种评估类型。
