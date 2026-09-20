# CS-B06 工作总结 root/item 右栏规则规格

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. 权威范围

本目录只约束模板内容设置页中：

```text
工作总结环节
→ 配置填写内容
→ 工作总结内容块 root 与其下填写题 item
→ 右栏设置及中栏即时联动
```

目标路由：`/performance/settings/templates/create?step=content`。目标页面采集 URL 为 `https://idreamsky.feishu.cn/perf/admin/templates/7680168681455815658/3`，viewport `1920×1080`、DPR `1`。

权威证据：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260903_170553_711902/captures/capture_model.json`。采集器结论为 `capture_integrity=passed`、`capture_completeness=passed`、`implementation_readiness=ready`、`blockers=[]`。

本契约以 2026-09-03 可信 root/item 绑定和 after-state 为准，明确取代父目录旧契约中“root 显示填写方式/必填、item 显示隐藏描述/允许多个”的相反归属。真实归属如下：

- root：`显示设置/隐藏描述`、`填写设置/允许添加多个`。
- item：`填写设置/在此环节填写|在此环节隐藏`、`必填项设置/必填`。

## 2. 非范围

- 顶部“全部内容”、左侧“工作总结环节”卡片。
- 配置参考内容、其他八个环节、评分评级、文本型填写题、标签型填写题。
- 保存、提交、发布、删除、清空、模板数据写入和后端持久化。
- 第二个同类型 item：页面不存在，`item-switch=not_attempted`，不得写成 passed。
- 本轮不代表实现侧像素验收通过；需要 rendered contract 与截图 diff。

## 3. root 规格

### 3.1 默认结构

```text
内容设置
└─ 显示设置
   └─ ☐ 隐藏描述
└─ 填写设置
   └─ ☐ 允许添加多个
```

默认均为未勾选。root 被选中时整卡使用 `2px solid #3370FF`、`4px` 圆角的选中边框；默认卡片 bbox 为 `(560,195.6667,792,280)`。

### 3.2 隐藏描述

- 勾选后，标题下“描述”节点从布局中移除，不保留占位。
- 卡片高度 `280px → 258px`，减少 `22px`。
- 取消后描述和空间恢复，卡片高度回到 `280px`。
- 不改变填写题编辑器、必填状态或其他内容卡片。

### 3.3 允许添加多个

- 勾选后，在当前工作总结 root 内、现有填写题编辑器下方左侧出现 `AddOutlined + 添加`。
- 按钮 bbox `(584,467.3125,54,22)`；SVG bbox `(588,471.625,14,14)`。
- 卡片高度 `280px → 314.3125px`，增加 `34.3125px`；因此“按钮出现前后底部空间保持不变”为否。
- 取消后按钮消失，卡片高度恢复 `280px`。
- 按钮只作用于当前工作总结 root，不是页面级“添加内容”。

## 4. item 规格

### 4.1 默认结构

```text
内容设置
└─ 填写设置
   ├─ ● 在此环节填写
   └─ ○ 在此环节隐藏
└─ 必填项设置
   └─ ☑ 必填
```

默认值：填写=true、隐藏=false、必填=true。单选和复选输入均为 `16×16px`，原生语义分别是 `role=radio`、`role=checkbox`，以 `aria-checked` 和 `checked` 同步表达状态。

item 被选中时，下半填写题区域 bbox `(560,281.6667,792,185.3333)`，使用 `2px solid #3370FF`、`4px` 圆角；root 外框不冒充 item owner。

### 4.2 在此环节隐藏

- 选择后，item 不删除、不折叠、不脱离布局。
- 中栏 item 保持卡片高度 `280px`，填写题名称和富文本编辑器转为灰色禁用态。
- item 右上出现 `VisibleLockOutlined`，SVG `16×16px`，bbox `(1326,288.125,16,16)`。
- 右栏“必填项设置”整组消失。
- 必填星号不可见。

恢复“在此环节填写”后，上述禁用态、隐藏图标和灰色状态消失，“必填项设置”恢复，原必填值保持为 true。

### 4.3 必填

- 取消“必填”只移除“填写题名称”后的红色星号，不改变 item/card 高度。
- 再次勾选后星号恢复。
- 必填切换不得影响 root 的隐藏描述和允许多个配置。

## 5. 所有权与状态隔离

```text
PerformanceTemplateContentSettings（页面状态）
└─ ConfiguredContentCardRoot
   ├─ root 选中边框
   ├─ 标题与描述
   ├─ ConfiguredContentItem
   │  ├─ item 选中边框
   │  ├─ 填写题名称/必填星号
   │  ├─ RichTextBox
   │  └─ VisibleLockOutlined（hidden only）
   └─ AddAnotherItemButton（allowMultiple only）
└─ ContentSettingsAside
   ├─ WorkSummaryRootSettings（selectedOwner=root）
   └─ WorkSummaryItemSettings（selectedOwner=item）
```

状态键必须至少包含 `entry_mode=regular_question`、`review_type=work_summary`、`config_discriminator` 与 `selectedOwner=root|item`。禁止按显示名称或列表索引推断归属。

已通过绑定重放验证：`root → item → root`。root 与 item 设置不串联；不同 item 隔离因页面只有一个同类型 item 而标记 `not_attempted`。

## 6. 开发约束

1. 机器真源为本目录 `extracted-ui-contract.json`；Markdown 不重新定义字段。
2. `PerformanceConfiguredContentBlock` 是完整业务组件：它同时持有 root/item owner、右栏设置入口、中栏联动、状态默认值与隔离；页面只按 `stageContentRules` 传入 `rootSettingsVariant`/`itemSettingsVariant` 并组装，不在页面中复制这些规则。
3. 本轮 `work-summary-root`/`work-summary-item` 是由工作总结环节启用的业务规则 variant，不是 `content.type === 'work_summary'` 的判断。工作总结环节中的其他内容块可以复用该完整组件；后续其他环节或内容区块只要取得独立真实证据，即可通过新的 stage rule variant 复用组件，不得凭内容类型猜测。
4. 评分评级、自定义文本型填写题和自定义标签型填写题在非工作总结环节不得自动继承 CS-B06；它们使用所属环节的 rule variant。未采集的环节/variant 不得宣称规则相同。
5. 优先复用 `PerformanceRadioGroup.vue`、`PerformanceCheckbox.vue`、`PerformanceRichTextBox.vue`，但必须通过显式 variant 对齐本契约 DOM、16px 几何和状态；名称相似不等于像素相同。
6. 完整业务组件向页面发出 owner 明确的事件；基础控件只负责控件本身，不负责业务联动。
7. `在此环节隐藏` 是禁用呈现，不是 `display:none`。
8. 所有目标绝对坐标只对 `1920×1080/DPR1` 有效；实现规则使用父容器约束和测量尺寸，不把 x/y 写成跨视口常量。
9. 当前只可声明 `ready_for_implementation`；没有实现截图、rendered contract 和 diff 时，`pixel_acceptance_status` 必须保持 `not-run`。
