# 评级量化状态开发契约

```text
completion_status: completed
pixel_restore_status: ready_for_implementation
source_state_id: RR-RATING-QUANTIFIED
parent_state_id: RR-CREATE-RATING
```

> 本文件只描述“评级可参与计算”由关闭切换为开启后的增量契约。PM-T006 总体状态仍以 `spec.md` 和 `extracted-ui-contract.json` 为准；本状态完成采集不解除 remark resize、rendered contract 和其他全功能 blocker。

## 1. Evidence

| 项目 | 值 |
| --- | --- |
| session | `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260828_105013_809771` |
| URL | `https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create` |
| viewport | 1920×1080，DPR≈1，Chrome 151 |
| before | `captures/initial/after.*` |
| trusted action | `captures/recording_events/event_0002/event.json`；actor=user，event_type=click，role=switch |
| after | `captures/recording_events/event_0002/after.*` |
| screenshot | `captures/recording_events/event_0002/after.png` |
| safety | 未提交、保存、预览、取消、删除、拖拽或切换评估类型 |

人工采集工具因“没有同源写请求”返回 `no_same_origin_mutation_observed`；该开关为纯前端状态，after HTML 中 `aria-checked="true"`、新增“量化分”列、截图、layout 和 computed 均存在，因此本 UI 状态证据有效。

## 2. State transition

```text
RR-CREATE-RATING
  gradeParticipatesInCalculation=false
  columns=[颜色与等级, 名称, 量化值]

-- click 评级可参与计算 switch -->

RR-RATING-QUANTIFIED
  gradeParticipatesInCalculation=true
  columns=[颜色与等级, 名称, 量化分*, 量化值]
```

开关契约：

| state | class | aria-checked | bbox |
| --- | --- | --- | --- |
| off | `ud__switch ud__switch-sm` | `false` | `(686.67,444.33,28,16)` |
| on | `ud__switch ud__switch-checked ud__switch-sm` | `true` | 约 `(687,444,28,16)` |

## 3. Data contract

`ReviewRuleLevel` 需要区分两个数值字段，不能把两列合并为一个 `value`：

```ts
interface ReviewRuleLevel {
  color: string
  code: string
  name: string
  quantifiedScore: string
  value: string
}
```

| field | quantified=false | quantified=true | required | control |
| --- | --- | --- | --- | --- |
| `levels[].quantifiedScore` | 不渲染 | 渲染“量化分”列 | 是 | number input |
| `levels[].value` | 渲染“量化值”列 | 继续渲染 | 否 | number input |

未采集行为：开关关闭后 `quantifiedScore` 是保留还是清空。实现应默认保留表单值、仅隐藏列；若产品要求清空，需要补充业务确认，不得从视觉证据推断。

## 4. Component contract

### ReviewRuleForm

```text
PerformanceSwitch
  v-model = gradeParticipatesInCalculation

LevelConfigEditor
  quantified = gradeParticipatesInCalculation
  levels = levels
```

### LevelConfigEditor

| prop | 用途 |
| --- | --- |
| `levels` | 等级数据 |
| `quantified` | 控制量化分表头、输入列和列宽变体 |
| `errors` | 等级代号等校验态 |

`quantified` 必须驱动真实 DOM，不得只声明未使用 prop。

## 5. Layout contract

### 列头

| state | label | x | y | visible width/row allocation |
| --- | --- | ---: | ---: | ---: |
| off | 颜色与等级 | 634 | 597 | 263 |
| off | 名称 | 905 | 597 | 263 |
| off | 量化值 | 1176 | 597 | 135 |
| on | 颜色与等级 | 626 | 597 | 220左右 |
| on | 名称 | 854 | 597 | 219左右 |
| on | 量化分 | 1081 | 597 | 113 |
| on | 量化值 | 1202 | 597 | 109左右 |

### 数字控件

| state | field | x | width | height | rows |
| --- | --- | ---: | ---: | ---: | ---: |
| off | 量化值 | 1176 | 135 | 31 | 3 |
| on | 量化分 | 1080 | 112 | 31 | 3 |
| on | 量化值 | 1199 | 112 | 31 | 3 |

开关开启后数字控件由3个变为6个。配置卡片保持 `(560,381,800,417)`，不因新增列增高，不产生新滚动。

## 6. Required mark and icons

“量化分”使用独立必填图标，不是普通文本星号：

| element | bbox | contract |
| --- | --- | --- |
| `AsteriskOutlined` | `(1127,605,8,8)` | `currentColor`，path以 after HTML/layout 为准 |
| `InfoOutlined`（量化分） | `(1139,601,16,16)` | 与量化分同行 |
| `InfoOutlined`（量化值） | `(1248,601,16,16)` | 与量化值同行 |

## 7. Implementation requirements

1. `ReviewRuleForm` 必须将 `gradeParticipatesInCalculation` 传给 `LevelConfigEditor.quantified`。
2. `LevelConfigEditor` 在 `quantified=true` 时新增“量化分”表头和每行输入框。
3. `ReviewRuleLevel` 增加独立 `quantifiedScore` 字段。
4. 两种状态分别使用明确的 grid variant；不得通过溢出或压缩偶然形成列宽。
5. 开关开启/关闭不改变等级数量、代号、名称、颜色和原量化值。
6. 新增等级时同时初始化 `quantifiedScore` 与 `value`。
7. `quantified=false` 时不得在 DOM 中保留可聚焦的隐藏量化分输入。

## 8. Acceptance contract

### AC-Q01 结构切换

Given `RR-CREATE-RATING` 且开关关闭  
When 点击“评级可参与计算”  
Then 开关 `aria-checked=true`，新增“量化分 *”列，每条等级行新增一个量化分数字输入，原“量化值”列继续存在。

### AC-Q02 数据与数量

Given 默认3条等级  
When 开启量化计算  
Then `quantifiedScore` 输入3个、`value` 输入3个；添加等级后两类输入各4个。

### AC-Q03 几何

Given 1920×1080 / DPR1  
When 渲染 `RR-RATING-QUANTIFIED`  
Then 配置卡片保持800×417；量化分和量化值数字控件分别约112×31，x约1080/1199；卡片底部收口关系保持目标值。

### AC-Q04 状态恢复

Given 已输入量化分  
When 关闭再开启开关  
Then 默认保留已输入值且隐藏态不产生可聚焦控件；若后续业务确认要求清空，另行修改契约。

### AC-Q05 提交与预览校验

Given 新建或编辑表单为评级，且量化计算开关已开启  
When 任一等级的 `quantifiedScore` 为空并点击提交或预览  
Then 对应输入显示“量化分为必填”，不产生 `submit` 或 `preview` 事件；补齐全部量化分后才允许继续。

## 9. Test scope

- `ReviewRuleForm.spec.ts`：开关值传入 `LevelConfigEditor`；off/on列结构切换；新建/编辑的提交与预览均阻断空量化分并显示错误。
- `LevelConfigEditor.spec.ts`：`quantified=false/true`；3→6数字输入；新增等级后4→8；列头和SVG。
- rendered contract：开关、卡片、四列头、两组数字控件、terminal gap。
- 截图状态：`RR-CREATE-RATING` 与 `RR-RATING-QUANTIFIED`。
