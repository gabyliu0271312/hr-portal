# 结果复议处理 · 像素还原重放清单

> 用途：工作区在 2026-11-04 16:33 被外部操作整体还原（HEAD 13eec8b4，未跟踪文件被清、已跟踪文件回到 HEAD），
> 本文件保存已完成并通过校验的实现要点，便于在稳定基线上一次性重放。
> 校验基线：`specs/002-performance-management/rea-extract/out/domspec1x/结果复议处理.json`（dpr=1，1680×950）。
> 校验结果：REA 127 条文本 **偏差 0**（`node compare-all.js --verbose`）。

## 1. REA 实测参数（右栏 631 宽，x=1021）

| 区块 | 几何 / 样式 |
|---|---|
| 页标题「绩效结果复议处理」 | 20px/30、600、`#1f2329`；盒 631×58（padding 16 0 12），文本 y139 |
| 分节标题「复议理由」 | 16/24 600，左内缩 10；蓝条 2×16 绝对定位 left0 top4；标题下 16 |
| 复议理由只读框 | 631×53 = padding 16/20 + 21；radius 4；bg `#f8f9fa`；下距 28 |
| 「是否保持复议前结果」 | 14/22 **600**；下距 8 |
| 单选行 | 行高 22；单选盒 16×16（border 1px `#8f959e`、radius 9999）；选中填充 `#1456f0`，白点 6×6 距盒左上各 5；盒与文案距 8；选项间距 24 |
| 「绩效结果」组标题 | 16/24 600；其上方 mt 20、下方 mb 20 |
| 组内说明（notice） | 631×62；padding 9/16；radius 6；bg `#f0f4ff` |
| 内容块 | 块间 32；块头 46（标题 24 + 描述 22）；字段名 14/22 600 |
| 富文本编辑器高度 | 重点工作 144 / 做得好的 188 / 待改进的 166（REA 按字段持久化） |
| 综合评级档位行 | 高 38（胶囊 32 + 上 4 下 2）；胶囊 60.4 宽、连接线 34.7 |
| 结果标签（参考区） | `3星` 44 宽居中 + 间距 8 + `符合预期`；文字 `rgb(12,41,110)`；**无胶囊底色** |
| 标签型填写题 | 灰底复选容器 631×46（padding 4/12，标签 margin-top 8，间距 24，radius 8，bg `#f8f9fa`）；富文本框 631×78（radius 6，border `#dee0e3`，内缩 9/7），占位「勾选标签后填写」`#8f959e` |

## 2. 数据模型改动（`src/api/performance.ts`）

```ts
// PerformanceTemplateField
type: 'rich_text' | 'rating' | 'tag_with_followup' | 'single_select'
// PerformanceTemplateContentItem / PerformanceTemplateContent
questionType?: 'text' | 'tag' | 'single'
// PerformanceTemplateOption
foreground?: string   // 等级结果态文字色（飞书 B-900，如 rgb(12,41,110)）
// PerformanceTemplateContent.settings
sampleOptionId?: string   // 预览示例档位
// PerformanceTemplateContentItem.settings
editorHeight?: number     // 富文本编辑器高度（按字段持久化）
```

## 3. 组件改动

1. **新增** `src/components/performance/PerformanceSingleSelectControl.vue`
   - props：`modelValue / options / interactive / invalid / ariaLabel`
   - 结构：`div[role=radiogroup]` > `label` > `input[type=radio]` + `span.__box > span.__dot` + `span.__label`
   - 样式按第 1 节单选行规格；`__box` 选中 `border-color/background: #1456f0`，`__dot` 6×6 白、`scale(0)→scale(1)`
   - `name` 用模块级自增 + 随机后缀，避免多实例互相取消
2. `performanceTemplateFieldRegistry.ts`：`single_select: { modes: ['edit', 'readonly'] }`
3. `PerformanceTemplateFieldRenderer.vue`：新增 `single_select` 分支（渲染控件 + 「暂无可用选项」），描述行条件扩展到 single
4. `PerformanceReadonlyAnswer.vue`
   - 新增 `single_select` 分支：`<span class="readonly-single">{{ selectedOption?.label }}</span>`
   - rating 结果态改纯文本徽标（去掉 `PerformanceRatingTag`）：`.readonly-rating-badge { display:inline-flex; min-width:44px; padding:0 10px; color:var(--rating-foreground) }`，无背景/圆角
   - 前景色优先 `option.foreground`
5. `PerformanceContentRenderer.vue`
   - `isCustomSingleItem` / `singleField` / `singlePreviewValue`（预览未选中）
   - `editorHeightStyle(item)` 下发 `--content-editor-height`
   - `ratingResult`：支持 `content.settings.sampleOptionId`，`foreground = option.foreground || performanceLevelForeground(color)`
   - rating 结果态用 `span.content-renderer-rating__result-code`（min-width 44、居中、无底色）替代 `PerformanceRatingTag`
6. `PerformanceRepeatableFillItemList.vue`：题型增加「单选组」；`options` 可增删改（默认两条空选项），行内输入 + 删除 + 添加
7. `PerformanceTemplatePreviewStep.vue`
   - `isResultReconsideration` + `keepResultOptions`（保持原结果 / 变更结果，默认选中「变更结果」）
   - 模板：页标题 → 复议区（分节标题 + 只读框 + 单选标签 + 单选组）→「绩效结果」组标题 → 内容块（`ptp-blocks--group`）
   - 样式：`.ptp-recon__*`、`.ptp-result-group__title`、`.ptp-blocks--group{margin-top:20px}`、`.content-renderer-item + .content-renderer-item{margin-top:16px}`、`.performance-rating-control__labels{padding:4px 0 2px}`、隐藏必填星号、富文本高度变量 `--content-editor-height`（默认 144，内容区 = 高度 - 44）
   - 左栏卡片用 `div[role=option]`（非 button）：点击不取焦点，避免列表因 focus 自动滚动；对照脚本用 `dispatchEvent('click')`

## 4. 桩数据（`verify/preview-harness.ts`）

- `n11`：`node_type: 'result_reconsideration'`、`content_page_name: '绩效结果复议处理'`
- `content`：7 个参考页签（工作总结 / 自评 / 上级评估 / 结果沟通 / 360°反馈 / OKR / 更多参考）+ 说明 + 工作总结 + 价值贡献（188/166）+ 综合评级（7 档 code/label/color/foreground，`sampleOptionId: 'o4'`）+ 标签型填写题（价值贡献 / 做得好的 / 待改进的）

## 5. 校验命令

```bash
cd specs/002-performance-management/rea-extract
node compare-all.js --verbose     # 11 环节批量，期望「合计偏差 0 或仅数据面差异」
node final-check.js               # 骨架锚点
```

## 6. 已知待补（下一轮）

- 内容设置页（`PerformanceTemplateContentSettings.vue`）的「结果复议处理」仍只有「复议理由」区块，需补：
  1. 「是否保持复议前结果」单选组（固定区块，可选中预览）
  2. 「绩效结果」分组容器（组标题 16/24 600 + 组内已有内容块列表）
- 预览空态文案 `暂未配置供参考内容` 的定位基准（`mt-120`）待复核。
