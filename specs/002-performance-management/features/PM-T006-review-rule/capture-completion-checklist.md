# PM-T006 采集完成校验清单

## 1. 已通过

- [x] 列表 URL、create URL 和真实 edit 路径已验证。
- [x] 所有有效 session viewport 为 1920×1080、DPR=1、Chrome 151、字体已加载。
- [x] 列表默认态、选中 tab、tab hover、工具栏、搜索 focus、筛选 hover已采集。
- [x] 表格六列、行操作 hover、删除 disabled、分页 disabled/selector 已采集。
- [x] 新建默认评级态和真实编辑预填态已采集。
- [x] 普通评分、评级、评分映射等级型三种分支已采集。
- [x] 评级的 switch、等级说明、等级行、拖拽/删除/add 控件已采集。
- [x] “评级可参与计算”开启态已人工补采：`RR-RATING-QUANTIFIED` 包含 `aria-checked=true`、新增量化分必填列、3个量化分输入、保留3个量化值输入、列宽重排和卡片高度不变；详细契约见 `quantified-rating-contract.md`。
- [x] “添加等级”为内联新增行，已纠正原弹窗假设。
- [x] 评分映射等级型的评分方式、上下限、两种区间规则、区间表头（`分数子区间 *` / `等级代号 *` / `等级名称`）、区间列表和三档小数位已采集。
- [x] 添加分数子区间前后状态已采集。
- [x] 提交/预览/取消 hover，评分 radio/添加等级/提交 focus 已采集。
- [x] 名称 focus、blur、空表单提交校验和前端阻断已采集。
- [x] Add/Search/Filter/Back/Drag/Delete SVG 的 viewBox、path、颜色和真实页面 bbox 已从 target contract 逐实例回溯；InfoOutlined、Down/DownBold、分页箭头和 checked checkbox 已覆盖可用状态。
- [x] full-screen-modal、内容滚动、8px scrollbar、footer z-index 和列表滚动结构已采集。
- [x] 评级颜色选择器已人工混采：24×24圆形触发器、`ExpandDownFilled`、12色色板、面板几何/边框/阴影/箭头、`DoneOutlined`选中态、选择后关闭及重开保持状态均有真实 screenshot/HTML/layout/computed/event 证据；source states 为 `RR-COLOR-PICKER-OPEN`、`RR-COLOR-SELECTED`、`RR-COLOR-PICKER-REOPENED`。
- [x] 评级预览专项已完成：空表单必填错误、非量化预览、switch false→true、量化分1/2/3、量化预览及两次 verified dismiss 均有完整证据。
- [x] 评分预览业务状态已完成：空表单必填错误、0～100上下限预览、固定值20/40预览及两次 verified dismiss 均有完整证据。
- [x] 评分映射预览专项已完成：空表单错误、0～100/边界60初始预览、输入合法分数50后的映射结果和 verified dismiss 均有完整证据。
- [x] 预览共享 modal、header、body、CloseOutlined、类型渲染器和 mapping preview input 已写入 `preview-extracted-ui-contract.json` / `preview-development-contract.md`。
- [x] 评分预览会话已离线重建：`missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`，空间分析 `completed`。
- [x] 备注textarea真实resize证据已补齐：default `49.3333px`、dragging/after-drag `149.0001px`，且 `after.height > default.height`。
- [x] 10 行状态确认行高48.67、table wrapper626、white card682、分页间距16、无表格内部纵向滚动；fullHeightFrame768且min-height0，768不是设计下限。
- [x] 20 行 Clone确认行高49、tbody980、table wrapper1120、white card1176、外层scrollHeight/clientHeight=1302/1024。
- [x] 原生 Chrome 确认20行可滚到底；Clone End未命中嵌套滚动容器，已排除源页面滚动缺陷。
- [x] 原 23 个命名交互状态完整证据包存在，新增 `RR-LIST-20-ROWS` 具备完整基础模型和像素产物。
- [x] `extracted-ui-contract.json` 已建立初版；主契约 47 个状态的 `visual_elements[]` 已逐实例投影且非空，包含 23 个旧状态、17 个预览状态和 3 个备注 resize 状态；主契约已升级 schema v2，评分空间约束已离线重建并清空 terminal anchor 缺口，备注 textarea resize 三阶段 bbox 已补齐。
- [x] `component-model.md`、`pixel-contract.md`、`acceptance-contract.md` 已绑定 `source_state_ids`。
- [x] 2026-08-30 固定分值20项评分预览新增variant已完成13个step的after证据包，包含表单、首屏/末屏、hover 5/15、边缘hover 10/11、左右导航和verified关闭；机器投影为 `fixed-score-options-20-capture-contract.json`。
- [x] 该新增variant确认保留为既有20/40目标的补充，不覆盖历史目标；绝对几何绑定894×631/DPR≈1，不跨viewport合并。
- [ ] 新增variant的 `validation_coverage.json` scope、replay、rendered contract、截图diff和像素验收：均未运行或未声明，不能作为实现完成证据。

## 2. 不适用或后续实现阶段验证

- [x] 瞬时 pointer `:active` 无可持久截图状态，记录 N/A；使用 click/after-click 与 focus 证据验收。
- [x] 提交按钮未观察到 disabled 业务态，记录 N/A；删除、分页和区间边界 disabled 已有真实证据。
- [x] 未执行有效保存、删除和业务数据写入，不属于 T00。
- [x] 实现截图和 diff 属于 T06，不阻塞 T00；T00 只提供目标截图与契约。

## 4. 提炼闭环子项

- [x] T00-E01 23 个 source_state_id 的 session、URL、viewport 和 7 类 artifact 路径逐一存在且可直接定位；已纠正并验证27个路径引用。
- [x] T00-E02 逐状态 fields 对象化：id、label、control、placeholder、required、order；23个状态、42个字段对象已通过字段结构检查。
- [x] T00-E03 逐状态 geometry 对象化：23个状态和9个组件均有数值 bbox、padding、margin 和来源标记；几何门禁错误数已降为0。
- [x] T00-E04 逐状态 styles 对象化：23个状态和9个组件均包含完整 computed style key set；styles 门禁错误数已降为0。
- [x] T00-E05 全量 SVG inventory：23 个 source state 已结构化覆盖 528 个可见 named data-icon/checked-checkbox SVG 实例，均有 source_state_id、viewBox、path、fill/stroke、target-level bbox、所属组件和 target contract 指针；`RR-LIST-20-ROWS` 已通过补采补齐 12 个真实 SVG bbox。

> E05 复核结果：`RR-LIST-20-ROWS` 使用补采 session `idreamsky.feishu.cn_20260826_194044_893758` 的 `captures/initial/target_contract.json`，该文件由 `captures/initial/layout.json` 的 22 个 SVG bbox 条目和对应 `after.html` 复核生成；未使用 intrinsic/default/estimated bbox。

- [x] T00-E06 逐状态 interactions 对象化：23 个 state 的全部 36 个 interaction 条目均包含 `kind`、`semantic_state`、`target`、`phases`、`before`、`after`、`action`，并回溯真实 `interaction.json` / `interaction_evidence.json`；备注 textarea resize 已另有 default/dragging/after 三阶段真实证据。
- [x] T00-E07 原基础 23 状态与新增 17 个预览状态的 component-model、pixel-contract、acceptance-contract、atomic-tasks、manifest 和机器契约双向覆盖检查通过；`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空，评分空间约束 `missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`、`unmapped_containers=[]`。
- [x] Preview-E07：状态、组件、字段、交互、SVG 和跨文档引用审计已完成；预览 rendered contract compare 已通过；`coverage.unmapped_*`、`cross_document_conflicts`、`missing_terminal_anchors`、`uncompared_variant_groups`、`unmapped_containers` 均为空。9 组全屏截图差异单独记录为 `pixel_status=failed`，不把结构审计误写成像素通过。
- [x] T00-E08 实现契约与 extracted target contract 反向比较：`rendered-ui-contract.json` 已由 Chrome CDP 运行时证据生成，预览 modal/header/body/close SVG/preview input 几何比较通过；主契约结构门禁通过。

## 5. 判定

```text
capture_json_integrity: passed
capture_visual_coverage: passed
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

T00-E01 至 T00-E08 的结构、证据和预览几何比较已完成；预览专项业务状态已投影到 `preview-extracted-ui-contract.json` / `preview-development-contract.md`，Chrome CDP 已生成 `rendered-ui-contract.json` 和 9 组实际截图/diff。当前唯一未通过项是全屏像素 diff：原始目标截图含不可复现的水印与字体渲染差异，严格阈值下 `pixel_status=failed`；不得将其改写为通过。T00 结构门禁可通过，但像素恢复总体继续保持 incomplete/blocked。
