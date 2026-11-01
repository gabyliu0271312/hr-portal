# CR-009-T01 双屏/全屏模式 UI 确认单

- 功能：填写工作总结/评价任务显示模式
- 蓝图：`CR-009-T01-write-modes-v1.html`
- PNG：`CR-009-T01-write-modes-v1.png`（初始全屏）、`CR-009-T01-write-modes-v1-dual.png`（双屏与弹窗展开；计划截图，非实现证据）
- 实现证据：`CR-009-T01-implemented-mode-menu.png`、`CR-009-T02-implemented-split-drag.png`、`CR-009-T03-implemented-narrow.png`。
- 状态：已确认；实现与浏览器验收完成
- 角色：工作总结本人、自评/评价人、已有校准任务执行人；权限仍以任务 API 为准。
- 路由：`/performance/review/self-summary`、`/performance/review/template-task`
- 来源：REA 弹窗/全屏/双屏截图及生产 bundle；按钮补充参数 `D:/乐逗/Desktop/双屏填写按钮.txt`。

## 已确认的设计事实

- 双模式：`fullScreenMode` / `basicWriteMode`。菜单标题“为当前窗口选择合适的填写模式”。两张124×106px模式卡片，弹窗约293×183px，底部右对齐，无全页遮罩。切换后菜单仍保持展开、选中态同步；顶部按钮文字/图标跟随模式。
- 全屏：当前任务表单铺满主内容区；现有人员头、页签、固定footer继续存在。
- 双屏：左区显示参考环节/来源内容及其页签，右区显示当前任务表单和提交footer；仅显示API返回且权限允许的reference。空列表显示“暂无可用参考内容”，不伪造OKR或调用新API。
- 默认左侧比例60%，offset初始-3px；外分隔条6px，手柄4px，三点SVG4×20；左右pane最小宽度524px，参考实际可用容器宽计算。
- 拖动：按下记录pageX；body mousemove每33ms节流；mouseup flush并结束；ResizeObserver更新宽度；窗口blur/组件卸载清理监听和节流尾调；比例与模式使用两个独立的本地显示偏好key，不触碰答案/任务数据。
- 参考区域和填写区域分别滚动；头部保持稳定。模式切换保留同一个填写器实例，富文本、答案、错误、版本和保存链不丢失，也不触发任务reload/save/submit。

## 已确认的本地适配

- 生产 bundle同时出现左右业务pane最小宽度524px与CSS `min-width:509px`；本地建议遵循计算算法的524px pane约束。
- 双栏需左右524px加13px分隔/间距预留；可用容器宽不足1061px时蓝图建议回退全屏并提示双屏暂不可用，保留偏好。此窄屏降级是本地适配决定，不宣称为飞书观测行为。
- `userMode` 初次无记录/非法时默认 `basicWriteMode`，按用户最新确认；窗口不足1061px时只临时采用全屏展示，不覆盖双屏偏好。与CR-008旧版“仅默认铺满不放切换入口”的边界由本CR明确替代。
- 比例在本地采用 `localStorage` try/catch，默认60%及独立key；REA生产使用抽象异步storage且key `draggableContainerOffset`。两者不是同一个底层存储实现，只对齐偏好语义。
- 分隔线键盘语义：separator + 左右箭头调整、Home/End边界；为本地可访问性补充，REA未证明飞书提供键盘拖动。
- 双屏左侧局部reference切换不改变任务当前页签/答案/路由；引用未提交与已完成但被服务端过滤到空，由现有参考状态组件表达。

## 页面状态/交互验收

| 状态 | 约定 |
|---|---|
| 默认/加载中 | 沿用现有任务loading/error，不误显示旧任务字段；模式控件在任务加载前禁用或使用当前有效偏好但不触发任务读写 |
| 全屏 | 单表单画布，中间滚动，footer保持 |
| 双屏 | 左只读reference、右当前表单；两侧独立滚动；右footer保持 |
| 无reference | 双屏左侧明确空状态；不伪造内容 |
| 整体/部分只读 | 服务端 editable/field.readonly 决定；布局切换不改变权限、字段或payload |
| 窄屏 | 小于双面板最小合计宽度时全屏回退，保留双屏选择偏好；界面可解释原因，不横向溢出 |
| 模式卡 | 键盘可到达，role/aria-checked或等效语义；Enter/Space选择；Escape/外部点击关闭并还焦触发器 |
| 分隔线 | 鼠标拖动、清理、尺寸变化重算；键盘separator；左右边界限制524px |
| 保存/提交 | 与模式切换无关；切换不调用任何写API，异常状态沿现有反馈 |

## 按钮/浮层/分隔线基线

按钮100×26px，14/400/22，padding 2px 4px，radius 6px；左模式SVG14×15，箭头14×14，间距4px。hover/expanded背景rgba(31,35,41,.1)，pressed背景.2；箭头200ms cubic-bezier(.34,.69,.1,1)。弹窗padding20px 16px、radius8、标题16/24 #646A73、标题下12px；卡片124×106、gap12px。进出过渡各300/200ms、纵向约8–12px；正式实现固定按同DPR下复核值，禁止把过渡中间态截图尺寸当静态布局值。

卡片四态图形沿用参数文件和REA的完整SVG：双屏默认/选中、全屏默认/选中；模式卡选中stroke #3370FF，未选#DEE0E3，选中面板示意底#E1EAFF、线#82A7FC，未选示意底#F5F6F7、线#D0D3D6。模式卡hover阴影和selected边框分别呈现，不把hover底色误做常态选中。

## 未纳入

不改schema/DTO/API、周期快照/角色授权、答案存储、评分计算；不自行创建无来源的参考内容；不将浏览器localStorage描述为安全授权或业务数据存储；不提交/部署生产，除非另有授权。

## 蓝图确认

- 用户确认版本：v1，2026-11-01
- 已确认的视图和窄屏降级：按钮/弹窗/全屏/双屏/可拖分隔/窄屏回退全屏/偏好恢复。
- 是否采用现有工作区初次默认全屏：否；足宽桌面无偏好时默认双屏，按用户确认。
