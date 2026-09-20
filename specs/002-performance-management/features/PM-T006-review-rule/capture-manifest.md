# PM-T006 采集证据清单

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

## 1. 环境

| 项目 | 值 |
| --- | --- |
| 列表 URL | `https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules?currentPage&pageSize` |
| 新建 URL | `https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create` |
| 编辑 URL | `review-rules/{id}?from`，真实行操作进入 |
| viewport | 1920×1080 |
| DPR | 1 |
| 浏览器 | Chrome 151 |
| 字体 | fonts_status=loaded；飞书/Lark 与 TikTokText 字体族见各 session environment |
| 色彩模式 | light |

## 2. 基础采集

| session | 范围 | 状态 |
| --- | --- | --- |
| `174513_706913` | 评估规则列表基础模型，15 个有效状态 | `capture_model.json` 完整；Mission 语义覆盖不完整，由后续混合采集补齐 |
| `174848_719207` | 新建评估规则基础模型，17 个有效状态 | `capture_model.json` 完整；业务分支由后续混合采集补齐 |
| `210222_926794` | 评估规则 20 行顶部态，1920×1080/DPR1 | 20 行、白卡片增长、table-wrapper、外层滚动和离屏分页完整写入 `capture_model.json` |
| 用户本机补采 | 评估规则 10 行顶部态，1280×639/DPR1.5 | metrics JSON + PNG；含真实人员信息和水印，仅作本机受控证据，不提交 Git |
| `idreamsky.feishu.cn_20260827_194044_893758` | RR-LIST-20-ROWS 补采默认态，1920×1080/DPR1/Chrome151 | `captures/initial/target_contract.json` 由真实 layout SVG bbox 和 after.html 复核生成；补齐 22 条 SVG bbox inventory，纳入 12 个功能 SVG 实例 |
| `idreamsky.feishu.cn_20260827_165635_233482` | 人工混采评级颜色控件与颜色选择面板，1920×1080/DPR1/Chrome151 | `manual_capture.json` 记录可信人工事件；`recording_events/event_0001` 面板打开、`event_0005` 选择色块、`event_0006` 面板关闭且颜色变化、`event_0007` 重新打开并保持选中态；未执行保存/提交/删除/拖拽 |
| `idreamsky.feishu.cn_20260828_105013_809771` | 人工混采“评级可参与计算”开启态，1920×1080/DPR1/Chrome151 | `recording_events/event_0002` 为可信 switch click 后状态；`aria-checked=true`，新增“量化分*”和每行输入，保留“量化值”；纯前端状态无同源写请求 |
| `idreamsky.feishu.cn_20260829_100229_628802` | 评级预览专项：必填校验、非量化预览、量化表单/预览、两次关闭 | capture/analysis `completed`；25 个有效状态；两次 `CloseOutlined` dismiss 均 verified |
| `idreamsky.feishu.cn_20260829_100910_045985` | 评分预览专项：必填校验、上下限预览、固定值20/40预览、两次关闭 | capture `completed`；25 个有效状态；修复分析器后离线重建为 `completed`，missing_terminal_anchors=[] |
| `idreamsky.feishu.cn_20260829_102314_409157` | 评分映射预览专项：必填校验、0～100/边界60初始预览、输入50后的映射结果、关闭 | capture/analysis `completed`；23 个有效状态；关闭 verified |
| `idreamsky.feishu.cn_20260829_115630_896677` | 备注textarea原生垂直resize专项 | default `49.3333px`；dragging/after `149.0001px`；完整HTML/layout/computed/target contract/screenshot证据 |
| `idreamsky.feishu.cn_20260830_105058_603180` | 固定分值20项评分预览新增variant：表单、首屏/末屏、边缘hover、左右切换、关闭 | capture model `completed`；13/13 captured_valid；894×631/DPR≈1；新增机器投影见 `fixed-score-options-20-capture-contract.json`；validation scope 未声明，replay/rendered/diff/pixel 保持 not-run |

## 3. source_state_ids

以下 `source_state_id` 是 PM-T006 文档稳定 ID；实际状态 ID 和证据目录不可拆开使用。

| source_state_id | session / state | 语义状态 |
| --- | --- | --- |
| `RR-LIST-DEFAULT` | `175206_362857 / hybrid-000-after` | 列表、选中 tab、工具栏、表格、分页默认态 |
| `RR-LIST-20-ROWS` | `210222_926794 / base layout` | 20 行自然增长：table wrapper 1120、white card 1176、outer scrollHeight 1302、无表格纵向滚动 |
| `RR-NEW-HOVER` | `175206_362857 / hybrid-002-after` | 新建按钮 hover |
| `RR-EDIT-HOVER` | `175206_362857 / hybrid-004-after` | 首行编辑 hover；删除仅观察 |
| `RR-EDIT-PREFILLED` | `175206_362857 / hybrid-007-after` | 真实编辑页、评级预填和 7 条等级数据 |
| `RR-CREATE-RATING` | `180052_715771 / hybrid-007-after` | 新建默认评级态、3 条空等级行 |
| `RR-RATING-QUANTIFIED` | `idreamsky.feishu.cn_20260828_105013_809771 / recording_events/event_0002` | 人工开启“评级可参与计算”；新增量化分必填列和3个数字输入，量化值列保留；详细契约见 `quantified-rating-contract.md` |
| `RR-COLOR-PICKER-OPEN` | `idreamsky.feishu.cn_20260827_165635_233482 / recording_events/event_0001` | 人工触发第一行颜色控件后，颜色选择面板打开；12 色、选中态、浮层和箭头可见 |
| `RR-COLOR-SELECTED` | `idreamsky.feishu.cn_20260827_165635_233482 / recording_events/event_0006` | 人工选择第 4 个颜色后面板关闭，第一行颜色变为 `rgb(217, 245, 214)`，所选色值为 `rgb(183, 237, 177)` |
| `RR-COLOR-PICKER-REOPENED` | `idreamsky.feishu.cn_20260827_165635_233482 / recording_events/event_0007` | 重新打开颜色面板，已选第 4 个颜色保持选中；面板位置/宽度随定位发生实测变化 |
| `RR-SUBMIT-HOVER` | `180052_715771 / hybrid-002-after` | 提交 hover |
| `RR-PREVIEW-HOVER` | `180052_715771 / hybrid-003-after` | 预览 hover |
| `RR-CANCEL-HOVER` | `180052_715771 / hybrid-004-after` | 取消 hover |
| `RR-ADD-LEVEL-HOVER` | `180052_715771 / hybrid-008-after` | 添加等级 hover |
| `RR-LEVEL-INLINE-ADD` | `180052_715771 / hybrid-010-after` | 点击添加等级后内联增加第 4 行；无弹窗 |
| `RR-MAPPING` | `180738_531610 / hybrid-002-after` | 评分映射等级型完整配置、2 条默认区间 |
| `RR-INTERVAL-HOVER` | `180738_531610 / hybrid-004-after` | 添加分数子区间 hover |
| `RR-INTERVAL-INLINE` | `180738_531610 / hybrid-007-after` | 点击后内联增加第 3 条区间 |
| `RR-NAME-FOCUS` | `182047_305189 / hybrid-000-after` | 名称输入 focus |
| `RR-VALIDATION-ERROR` | `182047_305189 / hybrid-003-after` | 空表单提交后的必填错误和前端阻断 |
| `RR-SCORE` | `182656_824828 / hybrid-003-after` | 普通评分完整配置 |
| `RR-TAB-HOVER` | `183237_683858 / hybrid-000-after` | 评估规则 tab 选中 hover |
| `RR-FILTER-HOVER` | `183237_683858 / hybrid-001-after` | 筛选按钮 hover |
| `RR-SEARCH-FOCUS` | `183814_980512 / hybrid-000-after` | 搜索框 focus |
| `RR-RADIO-FOCUS` | `184044_971473 / hybrid-000-after` | 评分 radio focus |
| `RR-ADD-LEVEL-FOCUS` | `184044_971473 / hybrid-001-after` | 添加等级 focus |
| `RR-SUBMIT-FOCUS` | `184044_971473 / hybrid-002-after` | 提交 focus |
| `RR-PREVIEW-RATING-VALIDATION` | `idreamsky.feishu.cn_20260829_100229_628802 / step_00-after` | 评级空表单点击预览前 |
| `RR-PREVIEW-RATING-VALIDATION-ERROR` | `...100229_628802 / step_03-after` | 名称和3行等级代号必填错误，modal不打开 |
| `RR-PREVIEW-RATING-NON-QUANTIFIED` | `...100229_628802 / step_10-after` | 评级非量化正常预览 |
| `RR-PREVIEW-RATING-QUANTIFIED-FORM` | `...100229_628802 / step_15-after` | switch已验证false→true，量化分列出现 |
| `RR-PREVIEW-RATING-QUANTIFIED` | `...100229_628802 / step_21-after` | 量化分1/2/3后的正常预览 |
| `RR-PREVIEW-RATING-COMPLETED` | `...100229_628802 / step_24-after` | 量化预览关闭并返回表单 |
| `RR-PREVIEW-SCORE-VALIDATION` | `idreamsky.feishu.cn_20260829_100910_045985 / step_02-after` | 评分空表单点击预览前 |
| `RR-PREVIEW-SCORE-VALIDATION-ERROR` | `...100910_045985 / step_05-after` | 名称和评分上下限必填错误 |
| `RR-PREVIEW-SCORE-BOUNDS` | `...100910_045985 / step_11-after` | 0～100上下限评分预览 |
| `RR-PREVIEW-SCORE-FIXED-FORM` | `...100910_045985 / step_16-after` | 固定值20/40表单态 |
| `RR-PREVIEW-SCORE-FIXED` | `...100910_045985 / step_21-after` | 固定值20/40预览 |
| `RR-PREVIEW-SCORE-COMPLETED` | `...100910_045985 / step_24-after` | 固定值预览关闭并返回表单 |
| `RR-PREVIEW-MAPPING-VALIDATION` | `idreamsky.feishu.cn_20260829_102314_409157 / step_02-after` | 映射空表单点击预览前 |
| `RR-PREVIEW-MAPPING-VALIDATION-ERROR` | `...102314_409157 / step_05-after` | 名称、上下限、区间和代号错误 |
| `RR-PREVIEW-MAPPING-INITIAL` | `...102314_409157 / step_16-after` | 0～100、边界60，未输入预览分数 |
| `RR-PREVIEW-MAPPING-VALUE-50` | `...102314_409157 / step_19-after` | 输入合法分数50后的映射结果 |
| `RR-PREVIEW-MAPPING-COMPLETED` | `...102314_409157 / step_22-after` | 映射预览关闭并返回表单 |
| `RR-REMARK-RESIZE-DEFAULT` | `idreamsky.feishu.cn_20260829_115630_896677 / step_00-before` | 备注textarea默认49.3333px |
| `RR-REMARK-RESIZE-DRAGGING` | `...115630_896677 / step_00-dragging` | 原生resize进行中149.0001px |
| `RR-REMARK-RESIZE-AFTER` | `...115630_896677 / step_00-after` | resize完成149.0001px |
| `RR-SCORE-FIXED-OPTIONS-20-FORM` | `...20260830_105058_603180 / hybrid_steps/step_01/after` | 固定分值1～20表单，20项，添加分值disabled |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-FIRST-WINDOW` | `...20260830_105058_603180 / hybrid_steps/step_03/after` | 预览首屏1～10，只有RightOutlined |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-HOVER-5` | `...20260830_105058_603180 / hybrid_steps/step_04/after` | 首屏hover 5 |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-EDGE-HOVER-10` | `...20260830_105058_603180 / hybrid_steps/step_05/after` | hover 10视觉状态；采集环境track偏移标记observed-not-target |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-LAST-WINDOW` | `...20260830_105058_603180 / hybrid_steps/step_07/after` | 末屏11～20，只有LeftOutlined |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-HOVER-15` | `...20260830_105058_603180 / hybrid_steps/step_08/after` | 末屏hover 15 |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-EDGE-HOVER-11` | `...20260830_105058_603180 / hybrid_steps/step_09/after` | hover 11视觉状态；采集环境track偏移标记observed-not-target |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-AFTER-LEFT` | `...20260830_105058_603180 / hybrid_steps/step_11/after` | 左导航恢复首屏 |
| `RR-PREVIEW-SCORE-FIXED-OPTIONS-20-COMPLETED` | `...20260830_105058_603180 / hybrid_steps/step_12/after` | CloseOutlined verified，返回表单 |

## 3.1 颜色控件人工混采补充

- session：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260827_165635_233482`
- 人工证据：`captures/manual_capture.json`、`captures/action_log.json`、`captures/recording_events/event_0000` 至 `event_0011`。
- 打开面板的有效状态：`event_0001`（after.png / after.html / layout.json / computed.json）；用户人工经过第一行颜色控件后面板展开。
- 选择颜色的有效状态：`event_0005` 为面板内第 4 个色块 click，`event_0006` 为面板关闭后的 after 状态；`event_0007` 重新打开并确认第 4 个颜色保持选中。
- 真实值：颜色面板 6 列×2 行，共 12 个色块；色块 18×18px、圆角 4px、列/行间距约 8px；面板 `x=518,y=544,w=189.33,h=77.33`，白底、0.666667px 边框、8px 圆角和实测阴影；第一行颜色触发控件 `x=600.67,y=631.33,w=24,h=24`，`ExpandDownFilled` 图标 bbox `x=607.67,y=638.36,w=10,h=10`。
- 选中结果：第 4 个色块 `rgb(183, 237, 177)`；面板关闭后第一行触发控件背景 `rgb(217, 245, 214)`。
- 限制：采集记录面板和选色结果，但未执行保存；实现契约已由 Chrome CDP 运行时生成，像素 screenshot diff 结果见 `evidence/preview-diff/diff-results.json`，当前严格全屏差异为 failed。

## 3.2 预览专项补充

- 机器投影：`preview-extracted-ui-contract.json`；开发投影：`preview-development-contract.md`。
- 三个会话的 `manual_capture.json`、`action_log.json`、`validation_coverage.json` 均存在；每个命名状态具备 after HTML、PNG、layout、computed、interaction evidence、target contract、validation 和 interaction JSON。
- 评级和评分各两次、映射一次预览关闭均通过 `inferred_icon_semantics → CloseOutlined → dismiss_verification=verified`。
- `评级可参与计算` 使用 `associated_text_control` 解析到真实 `role=switch`，并验证 `aria-checked=false→true`。
- 评分会话已在修复空间分析器后离线重建：`missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`、1720个container constraints、322个variant invariants，analysis `completed`。
- 未执行保存、提交、删除或业务写请求。

## 4. 证据包验证

已对原 23 个交互状态逐一检查完整证据包；新增 `RR-LIST-20-ROWS` 由 Clone 基础截图、`capture_model.json`、base layout、computed styles、artifact manifest 和离屏 DOM 共同支撑。

已创建 `extracted-ui-contract.json` 初版。T00-E05 已从各状态 target contract 的 `bbox_inventory` 逐实例提取可见 named data-icon/checked-checkbox SVG 的真实页面 bbox，并记录 `source_state_id`、所属组件、target selector 和 JSON pointer；`RR-LIST-20-ROWS` 已通过补采 session `idreamsky.feishu.cn_20260826_194044_893758` 的 `captures/initial/target_contract.json` 补齐 22 条 target SVG bbox inventory，纳入 12 个功能 SVG 实例，未使用 intrinsic size。

- `after.html`
- `after.png`
- `layout.json`
- `computed.json`
- `interaction_evidence.json`
- `target_contract.json`

结果：原 22 状态 `missing=[]` 且 JSON 可解析；20 行 session 的 20 个捕获状态均为 `captured_valid`，无缺失 screenshot/layout/pixel evidence。Mission 的自然语言优先级匹配仍为 incomplete，但不影响已核验的基础布局证据。

## 5. 行数增长证据

| 状态 | 行高 | tbody | table wrapper | white card | 外层滚动 |
| --- | ---: | ---: | ---: | ---: | --- |
| 10 行，1280×639/DPR1.5 | 48.67 | 486.67 | 626 | 682 | 808/583，max scrollTop 225 |
| 20 行，1920×1080/DPR1 | 49 | 980 | 1120 | 1176 | 1302/1024，max scrollTop 278 |

冻结关系：

```text
tableWrapperHeight ≈ 140 + rowCount × 49
whiteCardHeight = max(flex remaining height, tableWrapperHeight + 56)
```

两组证据均显示 table/table-wrapper `max-height:none`、table content `overflow-y:hidden`，分页紧跟最后一行 16px；纵向滚动属于 `.content.container-padding`。10行状态 `fullHeightFrame=768` 且 computed `min-height=0`，证明768为内容结果而非设计下限。原生 Chrome 已确认可以正常滚到底，Clone 的 End 键未命中嵌套滚动容器，不视为源页面缺陷。

## 6. 真实性与限制

- 所有视觉结论均以对应 `after.png` 和目标契约为准。
- 未提交有效业务数据；空表单提交仅触发前端校验。
- 未点击删除。
- hover/focus/checked/disabled/after-click 均有真实状态；瞬时 pointer `:active` 无持久状态，记录为 N/A，不编造独立样式。
- PM-T005 session 不再作为 PM-T006 页面证据，只允许复用已实现组件并重新按本清单验收。
- 原始采集目录不提交 Git；文档只保存受审查的契约摘要和本机证据路径。
