# PM-T006 评级配置等级拖拽优化契约

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

> 本契约针对 PM-T006「新建评估规则 → 评估类型=评级 → 配置等级 → 拖拽排序」的专项增强。当前只冻结目标证据、差异、组件边界和验收条件，不包含业务 API、数据库、权限、保存提交或其他评估类型的实现。

## 1. 目标与非目标

### 1.1 目标

- 使评级等级排序的手柄、行布局、拖拽边界和拖拽状态与源页面证据一致；
- 避免从输入框、颜色控件或删除按钮误启动拖拽；
- 建立可复用的拖拽手柄和排序行为边界；
- 为后续评分固定选项、评分映射区间、绩效模板内容卡片等排序场景提供可验证的公共契约；
- 在真实浏览器状态证据和 rendered contract 完成前，不宣称像素验收通过。

### 1.2 非目标

- 不新增评估规则业务能力；
- 不改变等级字段、量化分计算规则或校验规则；
- 不改变保存、提交、预览、删除和后端 API；
- 不在本契约中统一画布节点拖拽、文件拖拽或非列表拖拽；
- 不凭经验新增源页面未证实的拖影、占位线或动画。

## 2. 证据索引

### 2.1 本次专项采集

| 项目 | 值 |
| --- | --- |
| session | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_123158_661145` |
| URL | `https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create` |
| viewport | `1920×1080` |
| DPR | `1` |
| browser | Chrome；采集器环境使用系统 Chrome channel |
| mode | hybrid checkpoint；未执行保存、提交、删除 |
| action | 第 1 行 → 第 3 行；第 3 行 → 第 1 行 |

### 2.2 状态映射

采集器生成的状态 ID 仍是采集会话内部 ID，尚未正式写入 PM-T006 的稳定 `source_state_id`。本契约先保留映射：

| 契约状态 | 采集状态 | 证据目录 |
| --- | --- | --- |
| `RR-RATING-DRAG-IDLE` | `hybrid-000-after` | `captures/hybrid_steps/step_00/after` |
| `RR-RATING-DRAG-DOWN-BEFORE` | `hybrid-001-before` | `captures/hybrid_steps/step_01/before` |
| `RR-RATING-DRAGGING-DOWN` | `hybrid-001-dragging` | `captures/hybrid_steps/step_01/dragging` |
| `RR-RATING-DROP-DOWN` | `hybrid-001-after` | `captures/hybrid_steps/step_01/after` |
| `RR-RATING-DRAG-UP-BEFORE` | `hybrid-002-before` | `captures/hybrid_steps/step_02/before` |
| `RR-RATING-DRAGGING-UP` | `hybrid-002-dragging` | `captures/hybrid_steps/step_02/dragging` |
| `RR-RATING-DROP-UP` | `hybrid-002-after` | `captures/hybrid_steps/step_02/after` |

每个目录应同时具备 `after.html`、`layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json`、`validation.json`、`after.png` 和 `interaction.json`。本次已生成上述证据包。

### 2.3 当前采集限制

- `cancel/outside-release` 尚未采集；
- 键盘 Space、ArrowUp、ArrowDown、Escape 尚未采集；
- `replay_result.json` 为 `not_run`；
- 采集返回的正式状态仍为 `base`/`hybrid-*`，需在规格投影时绑定为本契约状态；
- 采集器外层清理调用不存在的 `WebClonerServer.close()`，进程退出码为 1，但采集证据已成功落盘；
- 不能将以上限制改写为已完成。

## 3. 源页面目标契约

### 3.1 行结构

源页面默认评级状态的等级行结构为：

```text
level row root
├── drag handle root
│   └── DragOutlined SVG
├── content wrapper
│   ├── color trigger
│   ├── code input
│   ├── name input
│   └── value input + stepper
└── delete button
```

| 元素 | 目标值 | 证据 |
| --- | --- | --- |
| 行 root | `x≈580.67, width≈758.67, height=32` | `step_00/after/layout.json` |
| 行 y | `627.33 / 671.33 / 715.33` | `step_00/after/layout.json` |
| 行垂直 pitch | `44px` | `step_00/after/layout.json` |
| handle root | `16×32px`；`draggable=false` | `step_01/dragging/target_contract.json` |
| handle root cursor | `grab` | `step_01/dragging/target_contract.json` |
| handle SVG | `DragOutlined`，`16×16px` | `step_00/after/target_contract.json` |
| color trigger | `x≈600.67`，`24×24px` | `step_00/after/layout.json` |
| content wrapper | `x≈600.67`，宽约 `710.67px` | `step_00/after/layout.json` |
| code input content | 宽约 `234.17px`，高 `22px` | `step_00/after/layout.json` |
| name input content | 宽约 `234.17px`，高 `22px` | `step_00/after/layout.json` |
| value input content | 宽约 `111.67px`，高 `22px` | `step_00/after/layout.json` |
| delete button root | `x≈1315.33`，`24×24.91px` | `step_00/after/layout.json` |
| delete SVG | `DeleteTrashOutlined`，`16×16px` | `step_00/after/target_contract.json` |

所有状态的最终几何以同一状态对应的 `target_contract.json` 和 `layout.json` 为准，不能跨状态合并 bbox。

### 3.2 手柄语义

源页面手柄具备：

- `role="button"`；
- `tabindex="0"`；
- `draggable="false"`；
- `data-rbd-drag-handle-draggable-id`；
- 每个等级独立稳定 ID；
- `DragOutlined` 原始 path；
- `aria-live`/隐藏播报节点。

已采集的语义播报：

```text
You have lifted an item in position 1
You have dropped the item. You have moved the item from position 1 to position 3
You have lifted an item in position 3
You have dropped the item. You have moved the item from position 3 to position 1
```

当前证据确认了抓取和放置播报；键盘完整动作仍需补采。

## 4. 当前实现差异（实现前基线）

当前实现见 [LevelConfigEditor.vue](../../../../hr-portal/frontend/src/components/performance/LevelConfigEditor.vue)。

### 4.1 已确认差异

| 优先级 | 差异 | 当前实现 | 目标实现 | 影响 |
| --- | --- | --- | --- | --- |
| P1 | 拖拽主体 | `.level-row` 设置 `draggable=true` | 只有 `16×32px` 手柄可拖，手柄自身 `draggable=false` | 输入和操作区域可能误启动拖拽 |
| P1 | 手柄命中区 | `24×24px` `PerformanceIconButton` | `16×32px` handle root | 命中范围和视觉图标不一致 |
| P1 | 行布局 | `24px + 36px + grid gap` | `16px handle + 4px margin + flex content + delete` | 颜色、代号、名称和数字列偏移 |
| P1 | 拖拽机制 | 原生 HTML5 row drag | 源页面为独立 handle、稳定 draggable ID 和 RBD 语义 | 交互行为和可访问性不一致 |
| P1 | 拖拽状态 | 仅 `.is-dragging { opacity:.6 }` | 至少有 grab、dragging、drop 及位置播报 | 当前缺少目标位置和状态反馈契约 |
| P1 | 键盘 | 没有排序键盘事件 | 手柄可聚焦；源页面存在 RBD 隐藏播报节点 | 键盘用户无法完成等价排序 |
| P2 | 行身份 | `:key="index"`；事件传递下标 | 稳定 draggable ID | 重排时可能复用错误子控件状态 |
| P2 | 数字控件 | compact root 固定 `112px`，内部 input 高度填满 | 目标值区含独立 input 和 stepper，复合 bbox 更宽 | 量化值列宽度和 root/part 结构不一致 |
| P2 | 行间距 | `32px + margin-bottom:10px`，预计 pitch 42px | 采集 pitch 44px | 多行纵向节奏偏紧 |
| P2 | 事件职责 | `reorder` 与 `update:levels` 同时发出 | 排序行为和业务状态更新职责需分离 | 后续抽象时容易重复更新 |

### 4.2 相关文件边界

`LevelConfigEditor` 没有独立渲染表头，表头位于 [ReviewRuleForm.vue](../../../../hr-portal/frontend/src/components/performance/ReviewRuleForm.vue) 的 `.level-header`。该文件重复使用了与行相同的 Grid 思路，因此本次差异修复不能只验证等级行，也必须验证表头和行的共同列对齐。

当前已有 [PerformanceDragHandle.vue](../../../../hr-portal/frontend/src/components/performance/PerformanceDragHandle.vue)，但该组件：

- 未被 `LevelConfigEditor` 使用；
- 固定 `width:600px`；
- 固定旋转 SVG；
- 仅发出 `pointerdown`，不负责完整排序状态机。

### 4.3 实现禁止项

以下不是可选实现细节，而是目标行为的边界：

- 禁止为同一个等级同时渲染正常列表行和完整 preview 行；
- 禁止以 `display:none` 原行加独立完整 preview 作为最终活动行模型；
- 禁止通过两个完整 `LevelConfigEditor` 行叠加形成拖拽反馈；
- 禁止对每个等级独立比较 `pointerY` 与自己的 `startRect.center` 来决定 displacement；
- 禁止让同一拖拽帧同时产生上方负向位移和下方正向位移，除非对应目标状态证据明确包含该组合；
- 禁止将 placeholder、活动行和兄弟行 transform 分别基于不同坐标系计算；
- 禁止以蓝色横线、蓝色底框、dashed border 或伪元素圆点替代透明 placeholder；
- 禁止只在 drop 后更新排序，拖拽过程中必须输出可观察的 impact/displacement 状态。

当前截图中出现的输入框、数字控件、删除按钮重叠，按本节判定为活动行重复渲染和文档流/transform 生命周期不符合，不作为目标视觉变体保留。

## 5. 组件化契约

### 5.1 `PerformanceDragHandle`

职责：

- 渲染拖拽手柄 root 和 `DragOutlined`；
- 提供 `grab`、`grabbing`、focus、disabled 状态；
- 提供稳定的 `aria-label`、`role`、`tabindex` 和必要 ARIA 属性；
- 只在手柄区域触发开始拖拽；
- 对外发出抓取、键盘和释放相关事件。

不负责：

- 修改等级数组；
- 计算目标位置；
- 处理等级字段；
- 处理业务校验；
- 决定新等级插入位置。

### 5.2 `PerformanceSortableList` 或 `useSortableList`

职责：

- 接收稳定 `itemKey`；
- 管理 active item、over item、dragging、drop、cancel；
- 管理鼠标/指针和键盘排序语义；
- 提供目标位置、占位和必要的拖影状态；
- 处理列表外释放；
- 维护拖拽期间的焦点和 `aria-live` 播报；
- 对外发出一次明确的 `reorder` 结果。

不负责：

- 等级字段业务规则；
- 分数区间边界计算；
- 内容卡片业务数据；
- 保存和后端同步。

### 5.3 `LevelConfigEditor`

职责：

- 使用排序组件承载等级行；
- 负责颜色、代号、名称、量化值和删除按钮；
- 负责添加/删除等级；
- 负责等级代号校验；
- 接收排序结果并更新 `levels`；
- 在 `quantified` 变体下维持量化分/量化值列。

### 5.4 不在本次抽取范围的拖拽

以下场景暂不强行迁移到同一组件：

- `PipelineDesignerView` 的画布节点拖动；
- 文件或资源拖入；
- 非列表的自由定位拖拽；
- 需要特殊自动滚动或跨容器投放的场景。

## 6. 状态机

```text
idle
  └─ pointerdown/focus handle → grab
       ├─ move beyond threshold → dragging
       │    ├─ move across item → over-item update
       │    ├─ drop inside list → dropped/reordered
       │    ├─ release outside → cancel/outside-release
       │    └─ Escape → cancel
       └─ release without movement → idle

keyboard focus
  └─ Space/Enter → keyboard-grab
       ├─ ArrowUp/ArrowDown → keyboard-move
       ├─ Space/Enter → keyboard-drop
       └─ Escape → keyboard-cancel
```

当前已具备证据：`idle`、`dragging`、`dropped/reordered` 和位置播报。

当前未具备完整证据：`cancel`、`outside-release`、`keyboard-grab`、`keyboard-move`、`keyboard-drop`。

## 7. 验收契约

### AC-D01 手柄边界

Given 评级配置显示 3 条等级行
When 检查第一条等级行
Then 拖拽手柄根命中区约为 `16×32px`
And 手柄 SVG 为 `DragOutlined`、`16×16px`
And 等级代号、等级名称、颜色和删除区域不承担拖拽启动职责。

### AC-D02 行布局

Given 1920×1080、DPR1、字体已加载
When 渲染默认评级配置
Then 等级行 root、颜色、代号、名称、量化值和删除按钮匹配对应状态的 target contract
And 行 y 位置和 pitch 与目标证据一致
And 表头与行列边缘对齐。

### AC-D03 向下排序

Given 默认等级顺序为第 1、2、3 行
When 将第 1 行拖到第 3 行
Then 顺序变为第 2、3、1 行
And 产生 dragging 和 dropped 状态证据
And 产生与源页面一致的位置信息播报。

### AC-D04 向上排序

Given 等级顺序已发生变化
When 将第 3 行拖到第 1 行
Then 顺序恢复为第 1、2、3 行
And 不修改每个等级的颜色、代号、名称、量化分和量化值。

### AC-D05 非拖拽区域隔离

Given 用户在代号、名称、数字输入或颜色控件上操作
When 按下并移动鼠标
Then 不启动等级行排序
And 输入、颜色选择和数字步进操作保持原有语义。

### AC-D06 稳定身份

Given 等级已经排序
When 重排、添加或删除等级
Then 每条等级保持稳定 ID
And 颜色、输入值和焦点不会错误迁移到另一条等级。

### AC-D07 取消与列表外释放

Given 等级处于 dragging 状态
When 按 Escape 或拖到列表外释放
Then 不改变等级顺序
And 清除 dragging 状态
And 焦点回到原手柄或符合采集证据的目标位置。

当前证据缺失，完成本 AC 前不得标记通过。

### AC-D08 键盘排序

Given 拖拽手柄获得焦点
When 使用 Space/Enter 抓取、ArrowUp/ArrowDown 移动、Space/Enter 放置
Then 等级顺序发生对应变化
And `aria-live` 播报当前位置
And Escape 可以取消。

当前证据缺失，完成本 AC 前不得标记通过。

### AC-D09 量化变体

Given “评级可参与计算”开启
When 进行等级排序
Then 量化分和量化值字段随等级对象一起移动
And 两列几何仍匹配 `RR-RATING-QUANTIFIED`
And 隐藏/显示量化分不改变等级对象身份。

## 8. 测试与证据要求

### 8.1 单元测试

- `LevelConfigEditor.spec.ts`
  - 稳定 ID 重排；
  - 只从 handle 启动拖拽；
  - 3→4 行后仍能排序；
  - quantified off/on 排序不丢字段；
  - add/remove/reorder 事件职责明确。
- `PerformanceDragHandle.spec.ts`
  - root 几何契约；
  - `role`、`tabindex`、ARIA 状态；
  - pointerdown、focus、keyboard 事件。
- `PerformanceSortableList.spec.ts`
  - grab/dragging/drop/cancel；
  - 列表外释放；
  - 键盘排序；
  - `aria-live` 播报；
  - 稳定 ID。

### 8.2 真实浏览器证据

至少补采：

- `RR-RATING-DRAG-CANCEL`；
- `RR-RATING-DRAG-OUTSIDE-RELEASE`；
- `RR-RATING-KEYBOARD-REORDER`；
- 含真实代号、名称和量化值的排序状态；
- 当前实现页面对应的 `rendered-ui-contract.json`。

### 8.3 通过门槛

必须分别记录：

- 功能测试：passed / failed / not-run；
- 真实拖拽：passed / blocked / not-run；
- 截图 diff：passed / blocked / not-run；
- contract compare：passed / blocked / not-run。

不能以当前 9 个组件测试通过替代真实浏览器拖拽验收。

## 9. 实施顺序建议

1. 将本契约中的采集状态正式映射到 PM-T006 `source_state_id`；
2. 补采取消、列表外释放和键盘状态；
3. 先修正评级行/表头的共同列布局；
4. 抽取无页面专属宽度和旋转假设的 `PerformanceDragHandle`；
5. 抽取排序行为层；
6. 迁移 `LevelConfigEditor`；
7. 生成实现页面 rendered contract 并执行目标比较；
8. 再评估是否迁移绩效模板内容卡片等其他场景。

## 10. 风险与回滚

### 风险

- 直接从 HTML5 拖拽切换到指针/键盘模型可能改变浏览器默认拖拽行为；
- 表头和行布局分属不同文件，单文件修复可能产生新的对齐偏差；
- 稳定 ID 引入后，已有测试 fixture 可能需要更新；
- 其他页面的 `PerformanceDragHandle` 当前带有页面专属样式，迁移时可能出现视觉回归。

### 回滚边界

- 排序组件迁移应保持 `levels` 数据结构和对外 `update:levels` 兼容；
- 如真实浏览器拖拽出现回归，可回滚排序行为接入，不回滚本契约中的目标几何和稳定 ID 设计；
- 不回滚或删除原始采集证据；
- 不将未完成状态标记为完成。

## 11. 完成判定

本契约只有在以下条件同时满足时，才可将专项优化标记为完成：

- 所有必需拖拽状态拥有完整证据包；
- 正式 `source_state_id` 已映射；
- `PerformanceDragHandle` 和排序行为职责已确定；
- `LevelConfigEditor` 与表头几何通过真实渲染比较；
- 鼠标、键盘、取消和列表外释放行为通过聚焦测试；
- rendered contract 与目标 contract 完成比较；
- PM-T006 原有 blocker 被单独处理，未被本契约静默覆盖。

## 12. 目标浏览器运行时操作证据（新增）

### 12.1 证据来源

- 用户执行脚本导出的轨迹文件：`D:/乐逗/Desktop/新建文本文档.txt`；
- 目标运行时 HTML：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_123158_661145/captures/hybrid_steps/step_01/dragging/after.html`；
- 目标 dragging layout：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_123158_661145/captures/hybrid_steps/step_01/dragging/layout.json`。

原始轨迹文件不纳入仓库。脚本 URL 中可能包含用户或租户标识，只保留经过审查的行为摘要，不复制带身份参数的资源地址、Cookie、Token、Authorization、本地存储或请求体。

### 12.2 轨迹统计

- 总记录：207 帧；
- 不同布局状态：77 个；
- 每帧记录 rows、handles、placeholder、body 状态和 pointer 信息；
- 轨迹未记录 viewport、DPR 和 scrollY，因此跨 session 的绝对 x/y 不作为最终几何值；同一轨迹内的相对尺寸、transform 和状态变化有效。

### 12.3 目标拖拽状态变化

目标轨迹确认以下状态序列：

```text
idle
→ pointerdown
→ drag lock
→ active row fixed
→ displaced rows update
→ placeholder appears
→ displaced impact transfers
→ drop
```

目标拖拽第 1 行向下时，轨迹出现：

```text
第2行 transform：40px → 36px → 23px → 15px → 10px → 4px → 0px
第3行 transform：保持40px
placeholder：透明；width≈758.667px；height=32px
```

这表示目标使用实时 displacement/impact 转移，而非固定的 `0px ↔ 40px` 二态切换。

### 12.4 目标事件入口摘要

目标事件监听器证据显示：

```text
window capture mousedown
→ findClosestDraggableId
→ tryGetLock
→ preventDefault
→ 记录起始坐标
→ 启动拖拽锁
```

键盘入口显示：

```text
window capture keydown + Space
→ findClosestDraggableId
→ tryGetLock
→ snapLift
→ 注册后续拖拽监听
```

资源列表显示页面使用 React/ReactDOM 生产包和主业务 bundle；目标拖拽 DOM 使用 `data-rbd-*` 属性。当前契约只依赖运行时行为，不要求在 Vue 项目中复制目标的压缩 bundle。

## 13. 目标运动与布局契约

### 13.1 活动行

目标活动行应满足：

- 同一等级 draggable 节点进入 `position: fixed`；
- 保留原始 row 的 width/height；
- fixed 行 `pointer-events: none`；
- `z-index: 5000`；
- transform 表达 pointer offset；
- body 在拖拽期间使用 `cursor: grabbing` 和 `user-select: none`；
- 不渲染蓝色目标线、蓝色底框或伪元素圆点。

### 13.2 Placeholder

placeholder 只负责维持列表空间，不负责视觉指示：

```text
display: flex
box-sizing: border-box
width: row width
height: 32px
margin-bottom: 8px
flex-shrink: 0
flex-grow: 0
pointer-events: none
border: none
background: transparent
```

实现不得使用 `2px` 蓝色线、dashed border、蓝色背景或两端圆点替代 placeholder。

### 13.3 受影响行

排序行为必须保存每个 item 的实时 displacement：

```text
active item: fixed + pointer offset
source = 0 向下：当前 impact 之后的受影响项按目标轨迹让位
source = last 向上：未越过有效 impact 边界时，上方项保持0px
source = middle：只更新拖拽方向对应的受影响项，不得上下两侧同时位移
impact transfer: 当前 item 恢复时，下一个 item 接替 displacement
```

`displacement` 不得只由拖拽开始时的 `startRects`、一次性 `overIndex` 或每个 item 的独立 pointerY 条件决定。目标判定、placeholder 位置和兄弟行 transform 必须由同一套 layout/impact 状态驱动。

### 13.4 反弹防护

- before/after 的切换不得在目标行中心附近反复抖动；
- impact 改变前应有稳定的有效边界或等价的状态保持策略；
- placeholder 变化不能导致目标判定立即反向变化；
- 每次 pointermove 最多产生一次有意义的 impact 更新；
- 不允许出现 `translateY(40px) → translateY(0) → translateY(40px)` 的非目标反复切换；
- 目标证据未明确的阈值必须标记为待验证，不得伪造具体数值。

### 13.5 方向性 displacement 矩阵

方向性规则以目标运行时轨迹为准，不允许对每个 item 独立比较 `pointerY` 与该 item 的 `startRect.center`。

| 拖拽来源 | 指针阶段 | 目标 displacement | 禁止结果 |
| --- | --- | --- | --- |
| 第1行 | 刚开始向下 | 第2、3行按 impact 让位 | 只能在 drop 后移动 |
| 第1行 | 越过第2行 | 第2行逐步恢复，第3行保持或接替 `40px` | 第2行 `40→0→40` 抖动 |
| 第1行 | 接近第3行 | 只保留当前 impact 需要的让位 | 通过蓝线代替行位移 |
| 第3行 | 刚开始向上 | 第1、2行保持 `transform:none`；第3行 fixed | 第1、2行立即同时 `-40px` |
| 第3行 | 接近第2行 | 只让当前上方 impact 范围位移 | 上方两行整体上移 |
| 第2行 | 向上移动 | 只影响上方方向的 impact 项 | 上下两侧同时位移 |
| 第2行 | 向下移动 | 只影响下方方向的 impact 项 | 上下两侧同时被撑开 |

已由目标证据直接确认：第3行向上拖拽的 dragging 状态中，第1、2行均为 static/transform none，第3行为 fixed；该证据覆盖 `RR-RATING-DRAG-UP-BEFORE` 与 `RR-RATING-DRAGGING-UP`。

### 13.6 Impact 数据结构

排序行为必须以一次统一的 impact 结果驱动渲染：

```text
sourceId: string
sourceIndex: number
dragDirection: up | down | null
impactIndex: number | null
insertPosition: before | after | null
displacedItemIds: string[]
displacementByItem: Record<string, number>
placeholderIndex: number | null
```

约束：

- `displacedItemIds` 是当前 impact 的结果，不由每个行组件自行判断；
- `displacementByItem` 可以包含目标轨迹中的过渡值，但同一 item 不得被两个方向同时位移；
- `impactIndex` 未改变时不得重新创建 placeholder 或反向切换位移集合；
- pointer 坐标、滚动偏移和行几何必须属于同一采样时刻；
- `startRects` 只用于建立初始几何，不得作为整个拖拽过程的唯一目标依据。

### 13.7 目标运动时间线

目标向下拖拽的有效时间线为：

```text
pointerdown
→ drag lock
→ active row fixed
→ transparent placeholder occupies a row-sized slot
→ rows below current impact move by 40px
→ pointer crosses the next impact boundary
→ previous displaced row transitions toward 0px
→ next displaced row keeps or receives 40px
→ drop commits the final order
```

目标轨迹已观察到 `40px → 36px → 23px → 15px → 10px → 4px → 0px` 的过渡值。实现应允许浏览器 transition 产生中间值，但状态源必须是稳定的 impact 转移，而不是 pointermove 中对多个行条件的独立反复赋值。

## 14. 当前实现与目标运行时的新增差异

| 优先级 | 当前实现 | 目标运行时 | 判定 |
| --- | --- | --- | --- |
| P0 | 使用固定 `±40px` 的 `getItemStyle` | displacement 在拖拽过程中连续转移，存在中间 transform 值 | 阻塞完全还原 |
| P0 | 目标计算使用一次采集的 `startRects` | RBD 类 drag lock/impact 持续驱动状态 | 阻塞稳定性 |
| P0 | 最后一行向上时按 `pointerY > center` 让上方行全部 `-40px` | 目标上方两行保持 `transform:none`，只有活动行 fixed | 方向逻辑错误 |
| P0 | 中间行同时按上下两个条件计算位移 | 同一时刻只允许一个方向的 impact 项位移 | 方向逻辑错误 |
| P1 | 原行 `display:none`，另渲染一个 preview wrapper | 同一 draggable row fixed 化 | 结构不一致 |
| P1 | placeholder 由当前列表模板动态插入，且 margin 为12px | 透明 row-sized placeholder，margin-bottom约8px | 几何不一致 |
| P1 | placeholder/target 曾使用蓝色线和目标高亮 | 目标证据中没有蓝色线，主要依靠位移表达落点 | 视觉不一致 |
| P2 | body 只在自定义组件状态下切换抓取行为 | 目标由全局 drag lock 统一管理 body 和事件 | 状态边界不一致 |

## 15. 逐帧验收扩展

### AC-D10 目标行实时位移

Given 第 1、2、3 行按顺序展示
When 从第 1 行手柄持续向第 3 行移动且尚未释放
Then 第 2 行和第 3 行可以自动让位
And 位移由目标 impact 决定
And 不需要等待 drop 才发生行移动。

### AC-D11 impact 转移

Given 第 2 行当前处于 `translateY(40px)`
When 拖拽对象继续向下接近第 3 行
Then 第 2 行逐步恢复到0
And 第 3 行继续保持或接替目标位移
And 不出现非目标的下移—反弹循环。

### AC-D12 透明占位

Given dragging 状态已建立
When 检查 placeholder
Then placeholder 为透明的 `32px` 行空间
And 无边框、无蓝色背景、无伪元素、无蓝色横线。

### AC-D13 活动行单实例

Given dragging 状态已建立
When 检查活动行
Then页面只显示一个可见的活动行实例
And 原始列表位置不显示第二份可见内容
And 活动行保持原始宽高、固定定位和 pointer offset。

### AC-D14 轨迹稳定性

Given 用户以连续鼠标移动经过第 2 行和第 3 行
When 连续读取每一帧 transform
Then displacement 只能按目标 impact 转移
And 同一 pointer 区间内不在 before/after 间来回抖动
And 每一帧的 rows、placeholder、active row 状态可重建。

### AC-D15 末行向上初始态

Given 第 1、2、3 行按顺序展示
When 从第 3 行手柄向上移动少量距离但尚未越过第 2 行的有效 impact 边界
Then 第 1、2 行保持 `transform:none`
And 第 3 行进入 fixed dragging 状态
And placeholder 保持在第 3 行的行尺寸空间
And 不得出现第 1、2 行同时 `translateY(-40px)`。

### AC-D16 首行向下初始态

Given 第 1、2、3 行按顺序展示
When 从第 1 行手柄向下移动但尚未完成 drop
Then 第 2、3 行根据目标 impact 自动让位
And placeholder 保持透明
And 活动行不需要释放即可产生位移反馈
And 不得使用蓝色线或蓝色底框代替让位反馈。

### AC-D17 中间行单向位移

Given 第 2 行处于 dragging 状态
When 向上移动
Then 只计算上方 impact 项的 displacement
And 下方行不因独立中心点判断而被撑开。

When 向下移动
Then 只计算下方 impact 项的 displacement
And 上方行不因独立中心点判断而被撑开。

And 同一帧不得同时存在上方负向 displacement 和下方正向 displacement，除非同一目标状态的 target contract 明确记录该组合。

### AC-D18 轨迹防反弹

Given 用户沿同一方向连续移动 pointer
When 读取相邻 animation frame 的 displacement map
Then impact 变化只能导致受影响 item 的有序接替
And 不得出现同一 item 在相邻有效 frame 中反复 `40px → 0px → 40px`
And 行位移、placeholder 和活动行坐标必须来自同一采样时刻。

## 16. 开发边界结论

- 拖拽全过程属于前端，不增加 API、数据库字段或后端排序接口；
- 完整还原应在 `PerformanceSortableList` 中实现 drag lock、live impact、displacement map、placeholder 和 active row 生命周期；
- `LevelConfigEditor` 只提供等级行内容和稳定 ID，不负责计算兄弟行位移；
- 不能继续只调 `transition`、`40px` 或颜色来解决反弹；
- 目标 bundle 可用于确认库实现，但最终验收以目标运行时轨迹和 DOM/CSS 契约为准；
- 只有在实现页面生成 rendered contract 并与上述逐帧目标证据比较后，才允许解除 `pixel_restore_status: blocked`。

## 17. 当前实现状态

```text
implementation_status: partial_nonconformant
completion_status: incomplete
pixel_restore_status: blocked
```

已完成：

- `PerformanceDragHandle` 增加 compact/strip 变体；评级场景使用 `16×32px` 手柄根，保留内容卡片场景的 strip 变体；
- `PerformanceSortableList` 已新增并覆盖基础手柄、阈值、drop/cancel、键盘和播报测试；但当前活动行、placeholder 生命周期和 impact displacement 仍未达到目标运行时契约；
- `LevelConfigEditor` 改为使用稳定等级 ID、独立拖拽手柄和排序行为组件；
- `ReviewRuleForm` 的等级表头改为与行共享的 Flex + 内容区布局；
- 评级数字控件宽度和内部输入高度按目标复合控件结构调整；
- `PerformanceTemplateContentSettings` 显式使用 `PerformanceDragHandle` 的 strip 变体，既有页面测试未回归失败；
- 新增拖拽手柄、排序行为和评级编辑器测试。

已验证：

- 6 个相关测试文件，25 个测试通过；
- `npx vite build` 通过，只有既有第三方 `@vueuse` PURE 注释警告；
- `docker compose build frontend` 通过，`hr-portal-frontend` 已重建并运行，`http://localhost:8080/` 返回 HTTP 200；
- 在容器页面上完成真实鼠标拖拽验证：出现拖拽预览和占位区域，放置后 `A/B/C → B/C/A`；
- `git diff --check` 无格式错误。

尚未完成：

- `npm run build` 的 `vue-tsc` 仍被既有 `TableMerge.vue:1042` 类型错误阻塞；
- 未生成当前实现的 `rendered-ui-contract.json`；
- 未执行目标 contract 反向比较；
- PM-T006-T00、PM-T006-T04、PM-T006-T05、PM-T006-T06 仍按现有状态保持未勾选；
- 本次独立采集的取消、列表外释放和键盘源页面证据仍未补齐；
- 最新过程截图确认当前仍存在完整 preview 行与正常列表行重叠；
- 最新目标轨迹确认末行向上初始态上方行应保持 `transform:none`，中间行不得上下两侧同时 displacement；当前实现需要按本契约重新校正；
- 在上述非符合项处理并完成逐帧比较前，不得勾选 PM-T006-T05 或解除 `pixel_restore_status: blocked`。
