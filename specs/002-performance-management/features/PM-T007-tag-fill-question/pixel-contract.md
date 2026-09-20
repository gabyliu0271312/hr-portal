# PM-T007 像素契约

```text
completion_status: incomplete
pixel_restore_status: blocked
```

## 1. 证据范围

权威采集环境为 1920×1080、DPR 1、中文、Light。当前可使用的目标证据：

- 列表默认：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_123014_357212\captures\initial\`
- 新建页 after：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_123014_357212\captures\hybrid_steps\step_01\after\`
- 新建按钮事件：`captures/action_log.json` 及 `captures/recording_events/`
- 编辑页 after：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_142513_564760\captures\hybrid_steps\step_12\after\`
- 表单状态 after：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_161653_099829\captures\hybrid_steps\step_05/after/`、`step_08/after/`、`step_11/after/`、`step_14/after/`

新建检查点在采集结束时为 `interrupted`，因此该状态用于结构和几何参考，不能作为完整交互验收通过证据。

## 2. 页面骨架

| component | state | geometry | style | evidence |
|---|---|---|---|---|
| 页面根 | list/create | `1920×1080` | 背景与字体按 computed；未逐项映射 | layout/computed |
| 侧栏 | list/create | `x=0,y=56,w=240,h=1024` | 白底；具体选中态待补采 | layout |
| 列表卡片 | list | `x=260,y=118,w=1640,h=942` | 白底、圆角/阴影需以 computed 为准 | initial/layout |
| 列表工具栏 | list | `x=280,y=138,w=1600,h=32` | 具体 gap 待确认 | initial/layout |
| 新建按钮 | list | `x=280,y=138,w=80,h=32` | 默认背景 `rgb(51,112,255)`，白字 | action_log |
| 表头 | list | `x=280,y=186.666672,w=1600,h=46.666668` | 列宽需从同一 layout 逐列提炼 | initial/layout |
| 分页 | list | `x=280,y=395.333333,w=1600,h=28` | 具体分页控件状态待补采 | initial/layout |
| 新建页 Header | create | `x=0,y=0,w=1920,h=56` | 返回+标题；SVG/边框需补齐 | create/layout |
| 新建表单根 | create | `x=584,y=64,w=752,h=719.333374` | 内容居中；细节按 computed | create/target_contract |
| 编辑页 Header | edit | `x=0,y=0,w=1920,h=56` | 返回+标题`价值观` | edit/target_contract |
| 编辑表单根 | edit | `x=584,y=64,w=752,h=719.333374` | 与新建页主体几何一致；回填内容不同 | edit/target_contract |
| 标签区域 | create/edit | `x=584,y=311.333343,w=752,h=352.666687` | 浅灰背景；圆角/内边距需按 computed | create/edit/layout |
| 底部操作区 | create | `x=584,y=767.333374,w=752,h=64` | 提交/预览/取消；细节需补齐 | create/layout |

## 3. 列表列

当前观察到列顺序：

```text
名称 | 创建人 | 创建时间 | 备注 | 操作
```

列的最终几何、排序和溢出仍需完成；第一行编辑按钮 hover 已获得独立事件和 bbox：`x=1638.47,y=246.33,w=28,h=22`，文字颜色 `rgb(36,91,219)`，背景透明，无边框，cursor pointer。不能直接套用 PM-T006 的列比例。

## 4. 新建页面字段

当前截图确认以下顺序和可见文案：

```text
中文 / 更多 / 多语言配置
名称 *
描述
标签
  名称 *
  说明
  提示
添加标签
备注
提交 / 预览 / 取消
```

已观察 placeholder 和 counter：

- 名称：`请输入名称`，maxlength 500；
- 描述：`请输入描述`，视觉 counter `0/20000`；
- 标签名称：`请输入标签名称`，maxlength 100；
- 标签说明：`请输入标签说明（选填）`，视觉 counter `0/20000`；
- 标签提示：`请输入提示（选填）`，视觉 counter `0/20000`；
- 备注：`填写帮助管理员理解此问题的内容，备注仅展示在飞书绩效管理后台`，counter `0/2000`。

除已列数值外，控件根、输入区、文本域、必填星号和 resize handle 的精确几何仍需从状态证据逐项确认。

## 5. SVG 和像素阻塞

已确认：

- 新建按钮使用 `AddOutlined`；viewBox `0 0 24 24`；SVG bbox 约 `14×14`；path 已进入 action log。

未确认：

- 评估题管理父菜单图标；
- 展开/收起图标；
- 导航选中态竖线实现；
- 返回图标；
- 编辑图标/操作按钮：当前为文字按钮“编辑”，目标 contract 未提供独立 SVG；不得自行替换为图标。
- 关闭/预览相关图标；
- hover/focus/active/disabled 的独立 computed 样式。

## 6.1 备注 textarea resize

已获得同一 viewport 下的 default/after-drag 证据：

- default：textarea bbox `x=584,y=714,width=752,height=49.33`；
- after-drag：textarea bbox `x=584,y=713.98,width=752,height=126`；
- 宽度保持 `752px`，高度增加 `76.67px`；
- after 样式边框为 `1px solid rgb(20,86,240)`，原生 textarea `min-height=50px`。

本期不新增 textarea dragging 中间态契约；实现直接复用现有多行文本框组件的垂直 resize 能力。已采集的 default/after-drag 数值只作为兼容性参考，不作为 PM-T007 独立实现变体。


当前 `extracted-ui-contract.json` 只记录了容器 bbox，四边 inset 和首末可见子节点仍为 `BLOCKED`。正式实现前必须运行 `derive_layout_relations.py`，并将结果回写机器契约、组件模型和验收契约。

## 7. 禁止推断

- 不将新建页实现为 dialog；已观察路径为独立页面 `/perf/admin/tagged-fill-in-questions/create`。
- 不用 PM-T006 的列宽、表格高度或 Header SVG 代替 T007 证据。
- 不因编辑页“看起来相似”就宣称新建/编辑共享组件已确认。
- 不用框架默认字体、按钮或图标代替缺失证据。
