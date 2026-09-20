# CS-B06 开发验收契约

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. 验收层级

| 层级 | 目标 | 当前状态 |
| --- | --- | --- |
| structure | root/item owner、字段顺序、控件类型、visible/forbidden | target ready |
| layout | bbox、卡片高度差、右栏 320px、控件对齐 | target ready |
| visual | 字体、颜色、边框、SVG、灰色禁用态 | target ready |
| behavior | radio/checkbox 联动、绑定重放、隔离 | target ready |
| pixel | HR Portal 实现截图 diff | not-run |

## 2. Given/When/Then

### AC-01 root/item 归属（stage rule variant）

- Given 工作总结环节中的任意已配置内容块存在，且该环节规则为 `rootSettingsVariant=work-summary-root`、`itemSettingsVariant=work-summary-item`。
- When 使用 root 命中区域选择整卡。
- Then 完整业务组件 `PerformanceConfiguredContentBlock` 只显示“显示设置/隐藏描述”和“填写设置/允许添加多个”；不得出现 item 设置。
- When 使用 item 命中区域选择下半填写项。
- Then 同一完整业务组件切换到 item owner，只显示“填写设置/在此环节填写|在此环节隐藏”和“必填项设置/必填”；不得出现 root 设置。
- And 组件启用条件由 stage rule variant 决定，不由 `content.type` 决定。

### AC-02 item 默认值

- Given item 被选中。
- Then `在此环节填写=true`、`在此环节隐藏=false`、`必填=true`。
- And radio/checkbox 均为 16×16，`checked` 与 `aria-checked` 一致。

### AC-03 item hidden

- Given item 为填写且必填。
- When 选择“在此环节隐藏”。
- Then radio verified `false→true`。
- And 右栏“必填项设置”不得存在。
- And item DOM 与卡片高度仍存在，root card height 必须为 280±1px。
- And item 呈灰色禁用态并显示 16×16 `VisibleLockOutlined`。
- And 必填星号不得可见。

### AC-04 item restore

- Given item hidden。
- When 选择“在此环节填写”。
- Then 编辑态恢复，“必填项设置”恢复，必填值仍为 true，隐藏图标消失，卡片高度仍为 280±1px。

### AC-05 required

- Given item fill+required。
- When 取消必填。
- Then checkbox verified `true→false`，填写题名称星号消失，几何不变。
- When 再勾选必填。
- Then checkbox verified `false→true`，星号恢复，几何不变。

### AC-06 hide description

- Given root 默认且描述可见，card height=280±1px。
- When 勾选隐藏描述。
- Then checkbox verified `false→true`，描述节点和 22px 布局空间同时消失，height=258±1px。
- When 取消勾选。
- Then描述恢复，height=280±1px。

### AC-07 allow multiple

- Given root 默认，card height=280±1px。
- When 勾选允许添加多个。
- Then checkbox verified `false→true`，当前 root 内出现 `AddOutlined + 添加`，button bbox≈54×22，card height=314.3125±1px。
- And 该按钮仅为已采集视觉入口，不执行新增 item、不改变内容模型、不发业务写请求，也不得成为页面级“添加内容”入口。
- When 取消勾选。
- Then按钮消失，height=280±1px。

### AC-08 owner isolation

- Given root/item 各自恢复默认配置。
- When 按 root→item→root 重放绑定。
- Then 每次右栏结构与 selectedOwner 匹配；root/item 值不串联；全部重放 action 不得 blocked。
- And `item-switch` 明确为 `not_attempted`，不得伪造第二 item。

### AC-09 SVG

- Given item hidden 或 root allowMultiple。
- Then SVG 的 data-icon、viewBox、bbox、path、fill/stroke 必须与 `pixel-contract.md` 一致；禁止文本字形、近似路径或其他图标替换。

### AC-10 像素验收门禁

- Given 仅有目标采集证据。
- Then 只能报告 `ready_for_implementation`，不得报告像素通过。
- When 实现完成并生成同 viewport rendered contract 与截图。
- Then 运行 `check_ui_spec.py --phase acceptance --compare-contract <rendered-ui-contract.json>`，并分别报告 structure/layout/visual/behavior/pixel。

## 3. 测试合同

前端 focused tests 至少断言：

1. root/item visible 与 forbidden 文案。
2. 默认 radio/checkbox 值与 DOM role。
3. hidden 后必填组消失，但 item DOM 和 280px 高度保留。
4. required 星号双向切换。
5. description 280↔258。
6. allowMultiple 280↔314.3125、按钮 DOM/SVG。
7. root→item→root 隔离。
8. 反向断言：root 不得渲染 item 设置，item 不得渲染 root 设置。

建议命令：

```text
python -m json.tool specs/002-performance-management/features/PM-T004-template-create/内容设置/CS-B06-主要内容右栏规则/extracted-ui-contract.json
python .claude/skills/performance-spec-development/scripts/check_ui_spec.py specs/002-performance-management/features/PM-T004-template-create/内容设置/CS-B06-主要内容右栏规则 --phase design --json
```

## 4. 2026-09-03 实现证据

- focused Vitest：4 个文件、23/23 通过，包含 `PerformanceConfiguredContentBlock` 完整业务组件和文本型 item 必填星号回归断言。
- Vite production build：2849 modules，成功。
- 实现门禁：`PM-T004-T09 --phase implementation` 无错误、无警告。
- 完整业务组件已按 stage rule variant 验证：工作总结环节启用 `work-summary-root/work-summary-item`；内容类型不作为规则开关。
- 仓库级 `vue-tsc --noEmit`：本任务文件无错误；被范围外 `ReviewQuestionTable.spec.ts` 及两个 report `expand_by` 错误阻断。
- 最新完整业务组件重构后的 Docker 运行时刷新未完成：Docker Desktop Linux engine 在一次重建尝试中不可用；因此 `PM-T004-T10` 尚未勾选。
