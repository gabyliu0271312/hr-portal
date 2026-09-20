# 自定义文本型填写题差异像素契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. 环境

- viewport：`1920×1080`
- DPR：`1`
- 浏览器缩放：`100%`
- 容器/卡片 tolerance：±1 CSS px
- checkbox/radio/SVG tolerance：±0.5 CSS px
- 文案、visible/forbidden：exact
- 原始证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_151126_823218` 与 `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_155422_606177`

## 2. 核心容器

| variant | card bbox | right aside | 事实 |
| --- | --- | --- | --- |
| root/item default | `(560,195.6667,792,280)` | `(1600,46.6667,320,1024)` | 默认结构 |
| root display-on | `(560,195.6667,792,258)` | `(1600,46.6667,320,1024)` | 描述和空间消失 |
| root display-off | `(560,195.6667,792,280)` | `(1600,46.6667,320,1024)` | 描述与空间恢复 |
| item display-on | `(560,195.6667,792,250)` | `(1600,46.6667,320,1024)` | 名称和星号消失，编辑器保留 |
| item display-off | observed about `(560,195.6667,792,250)` | `(1600,46.6667,320,1024)` | expected 280，当前视觉恢复 blocked |

右栏内容 x=`1620`，主行宽约 `272px`。基础 radio/checkbox 几何继承 [`../pixel-contract.md`](../pixel-contract.md)。

## 3. 动态差分

| transition | before | after | invariant / status |
| --- | ---: | ---: | --- |
| root 隐藏描述 on | h=280 | h=258 | x/y/w 不变；描述和空间移除 |
| root 隐藏描述 off | h=258 | h=280 | 描述、空间和顺序恢复 |
| item 隐藏名称 on | h=280 | h=250 | 名称/星号消失；编辑器和两组设置保留 |
| item 隐藏名称 off | h≈250 | expected h=280 | checkbox false 已确认；视觉/布局恢复 blocked |

## 4. 可见性契约

### root default

必须可见：`文本型填写题`、`描述`、填写题名称/编辑器、`显示设置`、`隐藏描述`。

禁止出现：`隐藏名称`、`填写设置`、`必填项设置`、`允许添加多个`。

### root display-on

必须可见：标题、填写题名称/编辑器、右栏 `隐藏描述` checked。

禁止出现：root 卡片内的 `描述` 及其布局占位。

### item default

必须可见：`文本型填写题`、`描述`、`填写题名称`、必填星号、编辑器、`隐藏名称`、填写设置、必填项设置。

禁止出现：root 的 `隐藏描述` 和 `允许添加多个`。

### item display-on

必须可见：描述、编辑器、`隐藏名称` checked、填写设置、必填项设置。

禁止出现：`填写题名称` 和必填星号。

### item display-off

必须可见：描述、编辑器、`隐藏名称` unchecked、填写设置、必填项设置。

名称、星号和 280px 高度应恢复，但当前证据不闭合，不能把恢复机制写成 `display:none`、节点移除或已通过。

## 5. DOM/样式边界

- root/item 命中区的 design-mask 是人工绑定证据，不代表页面必须复刻该 overlay 的业务归属。
- root display-on 只移除描述节点及其布局空间；标题和 item 编辑器保留。
- item display-on 只隐藏名称与必填星号；编辑器、填写设置和必填项设置保留。
- `在此环节隐藏`、`VisibleLockOutlined` 和 radio/checkbox 基础状态继承 CS-B06，不在本契约重复实现。
- 不得使用文字字形或近似 SVG 代替父级共享图标契约。

## 6. 验收门禁

当前只有采集侧证据，没有 HR Portal 实现侧 rendered contract 和截图 diff，因此 `pixel_acceptance_status=not-run`。实现后必须同 viewport 比较 geometry、styles、text/visibility、layout relations、container insets、owner 和 SVG；item display-off 恢复未闭合前，整体 `pixel_restore_status` 保持 `blocked`。
