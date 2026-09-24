# 组件模型模板

<!-- markdownlint-disable MD060 -->

编码前，从 `capture_model.json`、状态 HTML、`layout.json`、`computed.json`、截图和交互证据生成本模型。将同一内容同步写入功能目录的 `extracted-ui-contract.json`；JSON 是机器校验的结构化真源，Markdown 是面向开发者的说明投影。不得用需求描述或相邻页面替代真实证据。

## 0. 状态

```text
completion_status: incomplete | completed
pixel_restore_status: blocked | ready_for_implementation
uncovered_reasons:
- ...
```

只有所有必需状态均有完整证据包、下列各表无必填空项、且与 `capture-manifest.md` 一致时，才能使用 `completed` 和 `ready_for_implementation`。

## 1. Evidence index

| source_state_id | session | URL | viewport | state | evidence files | complete |
| --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | default/hover/... | HTML/layout/computed/screenshot/interaction/target contract | yes/no |

## 2. Component tree

用文本树记录页面 → 布局区 → 业务组件 → 基础控件。每个节点附 `source_state_ids`；未映射节点标记 `BLOCKED`。

## 3. Layout skeleton

| 维度 | 采集值 | source_state_ids |
| --- | --- | --- |
| 页面框架 | header、侧栏、内容区、工具栏、背景 | ... |
| 容器类型与尺寸 | page/dialog/drawer/full-screen-modal、bbox | ... |
| 头部 | 返回、标题、副标题、操作区、尺寸和间距 | ... |
| 内容分组 | 卡片顺序、bbox、padding、gap、边框、圆角、阴影 | ... |
| 字段布局 | label/control 列宽、方向、行距、对齐 | ... |
| 底部操作区 | 定位、尺寸、按钮顺序和间距 | ... |
| 滚动与层叠 | scroll root、sticky/fixed、overflow、z-index | ... |
| 响应式 | 已采集 viewport 与适用规则；未采集则 blocked | ... |

## 3.1 Container edge constraints

空白不是 DOM 节点。对每个卡片、表单、弹窗、抽屉、面板和内容容器，必须从 bbox 派生并记录首末可见内容和四边收口；使用 `scripts/derive_layout_relations.py` 投影采集器的 `derived_spatial_constraints`。

| component_id | state | container bbox | first visible child | terminal visible child | top/right/bottom/left inset | ownership | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... | ... | parent/child | layout.json |

规则：

- overlay、portal 和 fixed 节点不得成为普通父容器的 terminal child；
- 末端关系缺失必须写 `BLOCKED`，不得用 padding 或相邻状态猜测；
- 同一动态组件存在两个以上变体时，必须比较各边 inset 并输出 variant invariant 或显式差异；
- `container.bottom - terminal_visible_child.bottom` 必须进入机器契约和 Given/When/Then 验收。

## 3.2 Cross-state spatial invariants

| invariant_id | component_id | property | state measurements | expected / tolerance | ownership | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- |
| ... | ... | bottom_gap / top_gap / alignment / sibling_gap | ... | ... | ... | ... |


| component_id | 层级 | 职责 | props | emits / v-model | required states | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- |
| ... | 基础/业务/页面 | ... | ... | ... | default/hover/... | ... |

新建与编辑、预览与已配置状态如要求复用，必须在本表中指向同一组件树，不得只写文字声明。

## 4.1 Composite control parts

复合控件不得把内部子元素尺寸写成组件根节点尺寸。每个复合控件至少记录以下层级，所有行都绑定 `source_state_ids`：

| component_id | part_id | bbox_role | selector / anchor | parent_id | bbox | styles / tokens | viewport / DPR / variant | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ... | component_root / input_wrap / input / handle / handle_item / svg | component_root / container_part / input / handle / handle_item / svg | ... | ... | ... | ... | ... | ... |

规则：

- `component_root` 是完整视觉外框和命中区域；`input`、`handle`、SVG 只能记录自身 bbox；
- 绝对定位 overlay 不得通过 flex 剩余宽度推断；root、input、handle 的尺寸必须独立保留；
- `bbox_role`、`parent_id`、viewport、DPR、variant 缺一项时标记 `BLOCKED`；
- `ud__input-number` 示例：外层 `98×31px`、内部 input `75.0729×22px`、handle `32×30px`，三者不可互换。

## 5. Field inventory

| field | label | placeholder | required | limit | control | order | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | yes/no | ... | input/textarea/radio/... | ... | ... |

## 6. Option enumerations

| field | 完整选项与顺序 | default | disabled rules | source_state_ids |
| --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... |

## 7. State machines

| component | current state | event | guard | next state | visible/layout change | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... | ... | ... |

## 8. Visual state matrix

| component | state | bbox | typography | color/background | border/radius/shadow | opacity/cursor | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ... | default/hover/focus/active/disabled/expanded/... | ... | ... | ... | ... | ... | ... |

不适用状态写 `N/A` 并说明来源 DOM/行为依据；未采集但适用的状态写 `BLOCKED`，不得猜测。

## 9. SVG and icons

| component | purpose | viewBox | size | path | fill/stroke | hit area | states | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

## 10. Invariants

1. 字段、列、选项、顺序、控件类型、几何、样式和 SVG 只能来自映射证据。
2. 每个 `source_state_id` 必须回溯到 `capture-manifest.md` 中的真实文件。
3. 证据缺失或文档冲突统一进入 `uncovered_reasons`，并阻塞实现。
4. mock 数据不进入视觉组件模型；数据内容和记录数量不作为像素权威。
5. `spec.md`、本模型、完成清单、验收契约和原子任务必须使用相同状态与 blocker。
