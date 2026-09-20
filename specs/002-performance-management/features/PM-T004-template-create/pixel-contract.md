# PM-T004 内容设置像素契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 本轮已取得九环节主矩阵、抽屉/分组、卡片 root/item 和人工操作条 hover 的目标证据。
- 自定义内容最终进入中栏后的卡片状态、工作总结“更多”菜单、分组下拉选项弹层未完成。
- 新增分支 focus/active/disabled、resize、键盘和多 viewport 的完整目标证据未完成。
- 当前仅有目标采集证据，没有实现侧 rendered contract 或截图 diff；pixel 结果必须为 not-run/blocked。

## 0. 组件化与规则复用原则

九个环节使用同一个 `ContentSettingsStageRenderer`，由 `stageContentRules` 根据 `stage_type + executor_type + content_slot + content_type + selected_owner` 选择可见入口、内容 renderer 和 root/item 设置变体。禁止为每个环节复制页面、卡片、抽屉或右栏。

新建/编辑弹窗预览、抽屉回填摘要和中栏配置卡片预览使用同一个 `ContentPreviewRenderer` 与内容类型 renderer；差异通过 `render_context` 配置表达：

- `editor`：`EditorPreviewPane` 承载 draft 实时预览，不显示卡片操作条。
- `configured-card`：`CardPreviewArea` 承载已配置内容；卡片展开/折叠、root/item 选择和操作条由卡片外层负责。
- `drawer-summary`：`AssessmentContentDrawer` 承载摘要和 checkbox 回填，不负责卡片级设置。

复用内容模型、字段顺序和内容类型 renderer；不强行复用不同场景的外层 DOM 和交互责任。新增环节只增加规则注册项和 fixture，新增内容类型才增加对应 renderer。


本契约约束 `/performance/settings/templates/create?step=content` 的内容设置三栏、中栏内容变体、评估内容抽屉、设置分组弹窗、自定义内容弹窗、已配置卡片 root/item 和操作条。JSON 机器真源为 [`extracted-ui-contract.json`](extracted-ui-contract.json)，本文件只投影其几何、样式和状态边界。

## 2. Viewport 与坐标规则

| 证据组 | viewport | DPR | 用途 |
| --- | --- | ---: | --- |
| 存量内容/抽屉 | 1280×673 | 1.5 | 三栏、抽屉、分组和回填 |
| 九环节矩阵 | 1920×1080 | 1 | 9 环节 visible/forbidden 组合 |
| 自定义文本/标签 | 1280×673 | 1.5 | 双栏编辑器和抽屉回填 |

绝对 x/y 仅是对应状态的测量证据。实现必须遵循父级固定边界、同级对齐和中栏剩余空间规则，不得把不同 viewport 或不同模板的几何合并。

## 3. 页面与容器几何

| component_id | 目标几何/样式 | 约束 | source_state_ids |
| --- | --- | --- | --- |
| `TemplateBuilderLayout` | Header 下三栏；左栏 320px、右栏 320px、中栏占剩余 | 右栏与左栏边界固定，中栏不写死为 640px | `base`、`ALL9-360-INVITE-FILL` |
| `ContentSettingsAside` | 右栏约 320px；未选中为空态 | 面板内部独立滚动，不挤压目标内容宽度 | `base`、`ALL9-RESULT-VIEW` |
| `AssessmentContentDrawer` | 680px，右贴边；白底；shadow `rgba(31,35,41,.12) 0 0 24px` | Footer 固定可见；内容独立滚动 | `C10-DRAWER-OPEN` |
| `AssessmentGroupSettingsDialog` | 采集 bbox 1260×798；白色 dialog；四边 24px 内容收口 | 默认两组；第三组仅添加后出现；取消丢弃第三组 | `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED`、`C10-GROUP-DIALOG-CANCEL` |
| `AssessmentCustomEditor` | 1280×673/DPR1.5 下 920×609.33；左右双栏 | 文本/标签使用显式 type variant | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL` |
| `ConfiguredContentCardRoot` | 592×164（展开目标状态）；白底、1px 蓝边、8px radius | root bbox 不能用内部 item bbox 代替 | `C20-CARD-ROOT-SELECTED-CLEAN` |
| `ConfiguredContentItem` | 592×92（人工诊断目标状态）；独立边框和设置 | item 选择不改变 root 的职责 | `C20-CONTENT-BODY-SELECTED-DIAGNOSTIC`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` |

## 4. 容器边缘约束

机器值见 `extracted-ui-contract.json#/container_constraints`：

- `TemplateBuilderLayout`：container `(0,56,1280,617.33)`；first child 为左栏；terminal child 为右栏；四边 inset `0`。
- `AssessmentContentDrawer`：container `(600,0,680,673.33)`；first child header `(600,0,680,58)`；terminal child footer `(600,617,680,56)`；四边 inset `0`。
- `AssessmentGroupSettingsDialog`：container `(510,106,1260,798)`；first/terminal child 和四边 inset `24`，证据绑定 `C10-GROUP-DIALOG-OPEN`。

实现验收必须比较 container edge inset、first visible child、terminal visible child 和 `container.bottom - terminal.bottom`；缺少 rendered contract 时不得报告通过。

## 5. 卡片与操作条状态矩阵

| 组件 | 状态 | 目标行为 | source_state_ids |
| --- | --- | --- | --- |
| `ConfiguredContentCardRoot` | default | toolbar 不显示；卡片 geometry 保持 | `C20-CARD-ROOT-SELECTED-CLEAN` |
| `ConfiguredContentCardRoot` | header-hover | 虚线/hover 反馈和四按钮操作条出现；卡片宽高不变 | `C20-CARD-HEADER-HOVER` |
| `ConfiguredContentCardRoot` | root-selected | 右栏切换为卡片级设置 | `C20-CARD-ROOT-SELECTED-CLEAN`、`TYPE-WORK-SUMMARY-ROOT-TOP-CLICK` |
| `ConfiguredContentItem` | item-selected | 独立选中边框；右栏切换为内容项设置 | `C20-CONTENT-BODY-SELECTED-DIAGNOSTIC`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` |
| `ConfiguredCardActionToolbar` | visible | 顺序为上移、下移、编辑、删除；四个 24×24 控件 | `C20-CARD-HEADER-HOVER` |
| 操作条按钮 | button-hover | 仅当前按钮改变背景/颜色，不移动其他按钮 | `C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER`、`C20-TOOLBAR-EDIT-HOVER`、`C20-TOOLBAR-DELETE-HOVER` |
| 上移/下移 | disabled | 边界按钮保留布局，opacity 约 0.5；不使用 display:none | `C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER` |
| 卡片顶部 | dragging | 整个顶部拖拽条为命中区；grab → grabbing → drop | `C20-CARD-HEADER-HOVER`；完整 drop 目标仍需补证 |
| 卡片 | collapsed | 预览从可见布局移除，卡片变短；拖拽条和折叠控制保留 | 本轮 after 证据未完整取得，BLOCKED |

删除只记录 hover，未执行删除；不得把未执行动作写成已通过的 after-click。

## 6. Drawer/group/custom 状态

- 抽屉默认关闭可见性开关；开启后出现“设置分组”。已配置项为 checked-disabled。
- 抽屉同时存在“新建”和“全部展开”；配置项默认收起。展开后图标和顶部展开/收起控制同步。
- 分组弹窗默认分组 1、分组 2；每组有必填分组名称和评估内容选择器；可添加分组 3。
- 分组选择器选项弹层未稳定打开，不能填写选项、弹层 bbox、hover 或 selected 样式。
- 自定义文本弹窗记录名称、描述、文本型填写题、填写题名称、提示、预览；自定义标签记录标签型、名称、标签选择器以及真实选项“价值贡献/投入度/价值观”。
- 自定义内容在抽屉回填已确认；最终确定后的中栏卡片目标状态为 BLOCKED。

## 7. SVG 与图标

实现必须从对应目标 `target_contract` 读取精确 `viewBox`、path、fill/stroke。禁止文字字形、近似 SVG 或替换图标库：

- `SpaceUpOutlined`、`SpaceDownOutlined`、`EditOutlined`、`DeleteTrashOutlined`：操作条四按钮。
- `DownBoldOutlined`、`UpBoldOutlined`：抽屉行展开/收起。
- `MinimizeOutlined`：全部展开/收起。
- `DragOutlined`：视觉手柄；整条顶部横条负责命中。
- `CloseOutlined`：抽屉/弹窗关闭。

当前 `extracted-ui-contract.json` 的 `svg` 数组对缺失的精确 path 不做猜测；实现前必须补入目标 path 和 bbox，缺失时 pixel 状态保持 blocked。

## 8. 禁止项

- 禁止用名称、索引或通用模板猜测九环节 visible/forbidden 组合。
- 禁止把 rating 内容 `1111 / 年度综合评级` 归入工作总结。
- 禁止把透明 mask 的命中结果作为内容项 root 证据。
- 禁止在本轮范围写入模板保存、真实评估题 API、数据库、权限、UCP 或目标模板数据。
- 禁止跨 session、模板、viewport 合并 geometry 或将 blocked 状态改成 completed。
